// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

import {CratePacker} from "./CratePacker.sol";

/// @title CrateRouter
/// @notice Buys and sells $CRATE, and can do nothing else.
///
/// In v4 there is no pool contract to call. Every pool lives inside one manager,
/// and reaching a pool means unlocking that manager and being called back, which
/// a wallet cannot do on its own. So a trade needs a contract in between, and
/// this is the smallest one that does the job honestly.
///
/// What it is not allowed to become:
///
///   The pool is fixed at deployment. The constructor reads the key off the
///   CratePacker that opened it, so this router cannot be pointed at another
///   pool, another token, or a pool with a hook in it. There is no setter.
///
///   It holds nothing. Every trade settles inside a single transaction and ends
///   with the output in the trader's hands and any unspent ETH refunded. No
///   balance is meant to survive a call, and no function can move one out if it
///   somehow did.
///
///   It has no owner, no fee of its own, no pause and no upgrade. The only ETH
///   it ever sends goes to the pool manager to pay for a swap, or back to the
///   trader as change.
///
/// Every trade names a minimum output and a deadline, and reverts rather than
/// filling worse than either — the two things that turn a thin pool into a bad
/// day. Nothing here protects against the price simply being what it is.
contract CrateRouter is IUnlockCallback {
    /// @dev Uniswap's own bounds. Slippage is the caller's `minOut`, not a price
    /// limit, so these just say "as far as the pool will go".
    uint160 internal constant MIN_PRICE_LIMIT = TickMath.MIN_SQRT_PRICE + 1;
    uint160 internal constant MAX_PRICE_LIMIT = TickMath.MAX_SQRT_PRICE - 1;

    IPoolManager public immutable poolManager;
    CratePacker public immutable packer;

    /// @notice The token this router trades. Native ETH is always the other side.
    address public immutable token;
    uint24 public immutable fee;
    int24 public immutable tickSpacing;

    error Expired();
    error NothingIn();
    error NotPacked();
    error NotPoolManager();
    error RefundFailed();
    error TooLittleReceived(uint256 received, uint256 minimum);

    event Bought(address indexed trader, uint256 ethIn, uint256 crateOut);
    event Sold(address indexed trader, uint256 crateIn, uint256 ethOut);

    struct Trade {
        address trader;
        bool buying;
        uint256 amountIn;
    }

    /// @param packer_ The CratePacker that opened the pool. Everything this
    /// router will ever trade is read from it, so there is nothing to get wrong
    /// and nothing to change later.
    constructor(CratePacker packer_) {
        if (!packer_.packed()) revert NotPacked();

        PoolKey memory key = packer_.poolKey();

        packer = packer_;
        poolManager = packer_.poolManager();
        token = Currency.unwrap(key.currency1);
        fee = key.fee;
        tickSpacing = key.tickSpacing;
    }

    /// @notice Change from a swap, and nothing else, ever lands here.
    receive() external payable {}

    // ------------------------------------------------------------------ trades

    /// @notice Spend ETH on CRATE.
    /// @param minCrateOut The least CRATE worth doing this for.
    /// @param deadline Unix seconds after which this is stale.
    function buy(uint256 minCrateOut, uint256 deadline) external payable returns (uint256 crateOut) {
        if (block.timestamp > deadline) revert Expired();
        if (msg.value == 0) revert NothingIn();

        crateOut = abi.decode(
            poolManager.unlock(abi.encode(Trade({trader: msg.sender, buying: true, amountIn: msg.value}))),
            (uint256)
        );
        if (crateOut < minCrateOut) revert TooLittleReceived(crateOut, minCrateOut);

        // Whatever the pool would not take is the trader's, not ours.
        _refund(msg.sender);

        emit Bought(msg.sender, msg.value, crateOut);
    }

    /// @notice Sell CRATE back for ETH. Approve this router for `crateIn` first.
    /// @param minEthOut The least ETH worth doing this for.
    /// @param deadline Unix seconds after which this is stale.
    function sell(uint256 crateIn, uint256 minEthOut, uint256 deadline) external returns (uint256 ethOut) {
        if (block.timestamp > deadline) revert Expired();
        if (crateIn == 0) revert NothingIn();

        // Pulled in before the swap so the callback has it to settle with. A
        // token that took a fee on transfer would arrive short and the swap
        // would simply fail; CrateToken does not, and this router trades no
        // other token.
        IERC20(token).transferFrom(msg.sender, address(this), crateIn);

        ethOut = abi.decode(
            poolManager.unlock(abi.encode(Trade({trader: msg.sender, buying: false, amountIn: crateIn}))),
            (uint256)
        );
        if (ethOut < minEthOut) revert TooLittleReceived(ethOut, minEthOut);

        emit Sold(msg.sender, crateIn, ethOut);
    }

    // ---------------------------------------------------------------- callback

    /// @inheritdoc IUnlockCallback
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();

        Trade memory trade = abi.decode(data, (Trade));
        PoolKey memory key = poolKey();

        BalanceDelta delta = poolManager.swap(
            key,
            SwapParams({
                zeroForOne: trade.buying,
                amountSpecified: -int256(trade.amountIn), // negative is exact-input
                sqrtPriceLimitX96: trade.buying ? MIN_PRICE_LIMIT : MAX_PRICE_LIMIT
            }),
            ""
        );

        // One side is what the pool wants, the other is what it owes. Paying goes
        // to the manager; receiving goes to the trader. Neither address is a
        // parameter, so there is no call shape that sends the output elsewhere.
        uint256 received;
        if (trade.buying) {
            _pay(key.currency0, delta.amount0());
            received = _collect(key.currency1, delta.amount1(), trade.trader);
        } else {
            _pay(key.currency1, delta.amount1());
            received = _collect(key.currency0, delta.amount0(), trade.trader);
        }

        return abi.encode(received);
    }

    function _pay(Currency currency, int128 delta) private {
        if (delta >= 0) return;
        uint256 owed = uint256(uint128(-delta));

        if (currency.isAddressZero()) {
            poolManager.settle{value: owed}();
        } else {
            poolManager.sync(currency);
            IERC20(Currency.unwrap(currency)).transfer(address(poolManager), owed);
            poolManager.settle();
        }
    }

    function _collect(Currency currency, int128 delta, address trader) private returns (uint256 amount) {
        if (delta <= 0) return 0;
        amount = uint256(uint128(delta));
        poolManager.take(currency, trader, amount);
    }

    function _refund(address trader) private {
        uint256 change = address(this).balance;
        if (change == 0) return;

        (bool sent,) = trader.call{value: change}("");
        if (!sent) revert RefundFailed();
    }

    // ------------------------------------------------------------------- views

    /// @notice The one pool this router can reach.
    function poolKey() public view returns (PoolKey memory) {
        return packer.poolKey();
    }
}
