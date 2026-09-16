// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";

/// @title CrateSeal
/// @notice The crate. It owns the one liquidity position $CRATE ever had, and
/// there is no way to take anything out of it.
///
/// Uniswap v4 makes that claim simpler than v3 could. A v4 position is not an
/// NFT; it is a row in the pool manager keyed by the address that added it. This
/// contract is that address, so the position is not a thing anyone can be given,
/// sold, borrowed against or mistakenly approved away. It can only be reduced by
/// this contract calling `modifyLiquidity` with a negative delta, and this
/// contract never does. Search the file: the only liquidity deltas here are zero
/// and positive.
///
/// The rest of the surface is just as narrow. `take` always names this contract
/// as the recipient, `settle` always pays the pool manager, and nothing else
/// moves a balance. So the crate is one-way: fees earned by the sealed liquidity
/// are put back into the sealed liquidity. Anyone may pay the gas to do it —
/// `compound` takes no arguments and pays its caller nothing, so there is no
/// privileged party here at all, not even the address that packed it.
contract CrateSeal is IUnlockCallback {
    using StateLibrary for IPoolManager;

    /// @dev One position, so it needs no distinguishing salt.
    bytes32 internal constant POSITION_SALT = bytes32(0);

    enum Action {
        Seal,
        Compound
    }

    IPoolManager public immutable poolManager;

    /// @notice The packer that deployed this seal. Its only power is to fill the
    /// crate once, in the packing transaction; afterwards `sealIn` reverts for
    /// everyone, it included.
    address public immutable packer;

    /// @notice True once the liquidity is in. It never goes back to false.
    bool public isSealed;

    int24 public tickLower;
    int24 public tickUpper;

    PoolKey internal _key;

    error AlreadySealed();
    error NotPacker();
    error NotPoolManager();
    error NotSealed();
    error NothingToAdd();

    event Sealed(PoolId indexed poolId, int24 tickLower, int24 tickUpper, uint128 liquidity);
    event Compounded(PoolId indexed poolId, uint128 liquidityAdded, uint256 amount0, uint256 amount1);

    constructor(IPoolManager poolManager_) {
        poolManager = poolManager_;
        packer = msg.sender;
    }

    /// @notice Native ETH taken back out of the pool manager lands here, and so
    /// does anything anyone chooses to send. Either way it is inside the crate:
    /// the next `compound` puts it into the position, and nothing else can.
    receive() external payable {}

    // ----------------------------------------------------------------- packing

    /// @notice Put the whole balance of this contract into one position and shut
    /// the crate. Callable once, by the packer, in the packing transaction.
    function sealIn(PoolKey calldata key_, int24 tickLower_, int24 tickUpper_) external returns (uint128 liquidity) {
        if (msg.sender != packer) revert NotPacker();
        if (isSealed) revert AlreadySealed();

        isSealed = true;
        _key = key_;
        tickLower = tickLower_;
        tickUpper = tickUpper_;

        liquidity = abi.decode(poolManager.unlock(abi.encode(Action.Seal)), (uint128));
        emit Sealed(key_.toId(), tickLower_, tickUpper_, liquidity);
    }

    // ------------------------------------------------------------- compounding

    /// @notice Sweep the trading fees the sealed liquidity has earned and put
    /// them straight back into it. Permissionless: the caller spends gas and
    /// receives nothing, and no path through this function can move value to any
    /// address other than the position itself.
    ///
    /// @dev A position sitting entirely on one side of spot only absorbs one of
    /// the two currencies, so the other waits here until the range is crossed
    /// and a later call can use it. It is inside the seal either way.
    function compound() external returns (uint128 liquidityAdded) {
        if (!isSealed) revert NotSealed();
        liquidityAdded = abi.decode(poolManager.unlock(abi.encode(Action.Compound)), (uint128));
    }

    // ---------------------------------------------------------------- callback

    /// @inheritdoc IUnlockCallback
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();

        bool compounding = abi.decode(data, (Action)) == Action.Compound;
        if (compounding) _collectFees();

        (uint128 liquidity, uint256 amount0, uint256 amount1) = _addEverythingHeld();
        if (compounding) emit Compounded(_key.toId(), liquidity, amount0, amount1);

        return abi.encode(liquidity);
    }

    /// @dev Modifying a position by zero settles the fees it has accrued and
    /// nothing else — there is no separate collect in v4. The credit is taken to
    /// this contract so the add below can spend it.
    function _collectFees() private {
        (BalanceDelta fees,) = poolManager.modifyLiquidity(
            _key,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: 0,
                salt: POSITION_SALT
            }),
            ""
        );

        if (fees.amount0() > 0) poolManager.take(_key.currency0, address(this), uint128(fees.amount0()));
        if (fees.amount1() > 0) poolManager.take(_key.currency1, address(this), uint128(fees.amount1()));
    }

    /// @dev Turns everything this contract holds into liquidity in the one
    /// position. The amounts are read as balances rather than passed in, so
    /// there is no argument a caller could use to aim this somewhere else.
    function _addEverythingHeld() private returns (uint128 liquidity, uint256 amount0, uint256 amount1) {
        PoolKey memory key = _key;
        PoolId poolId = key.toId();

        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolId);

        amount0 = key.currency0.balanceOfSelf();
        amount1 = key.currency1.balanceOfSelf();

        liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            amount0,
            amount1
        );
        if (liquidity == 0) revert NothingToAdd();

        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: int256(uint256(liquidity)),
                salt: POSITION_SALT
            }),
            ""
        );

        _settle(key.currency0, delta.amount0());
        _settle(key.currency1, delta.amount1());
    }

    /// @dev Pays what the add cost, or takes back what it did not use. The
    /// recipient of a `take` is this contract and the recipient of a `settle` is
    /// the pool manager; neither is a parameter anyone can set.
    function _settle(Currency currency, int128 delta) private {
        if (delta == 0) return;

        if (delta > 0) {
            poolManager.take(currency, address(this), uint128(delta));
            return;
        }

        uint256 owed = uint256(uint128(-delta));
        if (currency.isAddressZero()) {
            poolManager.settle{value: owed}();
        } else {
            poolManager.sync(currency);
            IERC20(Currency.unwrap(currency)).transfer(address(poolManager), owed);
            poolManager.settle();
        }
    }

    // ------------------------------------------------------------------- views

    /// @notice The pool this crate is liquidity in. Empty until packed.
    function poolKey() external view returns (PoolKey memory) {
        return _key;
    }

    /// @notice How much liquidity the crate holds, read from the pool manager
    /// rather than from a number this contract keeps for itself.
    function sealedLiquidity() external view returns (uint128) {
        if (!isSealed) return 0;
        return poolManager.getPositionLiquidity(
            _key.toId(), keccak256(abi.encodePacked(address(this), tickLower, tickUpper, POSITION_SALT))
        );
    }
}
