// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {CrateSeal} from "./CrateSeal.sol";
import {CrateToken} from "./CrateToken.sol";

/// @title CratePacker
/// @notice Packs the crate, once.
///
/// This contract launches exactly one token, with a name and ticker it cannot be
/// talked out of, in a single transaction:
///
///   1. mint the whole fixed supply, straight to the seal,
///   2. open a Uniswap v4 pool against native ETH, priced so the whole supply
///      sits on the token's side of it,
///   3. tell the seal to put all of it in, which it can only do once.
///
/// Afterwards `packed` is true and every entrypoint here is either a view or
/// reverts. There is no second token and no owner function. The address that
/// packed it holds nothing, because the supply never passed through this
/// contract either: it was minted to the seal.
///
/// Nothing is held back for anyone. The whole supply goes into the pool, and the
/// only thing the project ever earns is the pool's trading fee, which the seal
/// pays to an address fixed before the token existed.
///
/// Two things v4 gives this design that v3 could not:
///
/// The pool's other side is native ETH, which is `address(0)` and therefore
/// always `currency0`. So the token is always `currency1`, the supply always
/// sits *below* spot, and there is no address-ordering puzzle to solve — the v3
/// version of this contract needed CREATE2 and an address prediction just to
/// know which way round the pool would be. There is no WETH in this launch at
/// all.
///
/// And the pool has no hook. `hooks` is the zero address, which is a permanent
/// property of the pool key: there is no code that runs on swaps, no place to
/// put an upgrade, and no fee that can be switched on later.
contract CratePacker {
    using StateLibrary for IPoolManager;

    struct PackParams {
        uint24 fee; // static LP fee, hundredths of a bip; 10000 is 1%
        int24 tickSpacing;
        uint160 sqrtPriceX96; // initialization price, computed off-chain
        int24 tickLower;
        int24 tickUpper;
    }

    /// @notice The whole supply. Not a parameter, and minted exactly once.
    uint256 public constant SUPPLY = 1_000_000_000e18;

    string public constant TOKEN_NAME = "Crate";
    string public constant TOKEN_SYMBOL = "CRATE";

    IPoolManager public immutable poolManager;
    CrateSeal public immutable seal;

    /// @notice The account that deployed this packer and may call `pack`. It has
    /// no other power, and none at all once `packed` is true.
    address public immutable packer;

    address public token;
    int24 public tickLower;
    int24 public tickUpper;
    uint256 public packedAt;
    bool public packed;

    PoolKey internal _key;

    error AlreadyPacked();
    error BadFee();
    error BadRange();
    error NotPacker();
    error NotSingleSided();
    error ZeroAddress();

    event Packed(address indexed token, PoolId indexed poolId, uint128 liquidity);

    /// @param poolManager_ The Uniswap v4 PoolManager to launch into.
    /// @param feeBeneficiary_ Where the position's trading fees go, forever. The
    /// seal stores it as an immutable and nothing can change it afterwards —
    /// including this contract, which keeps no reference to it at all.
    constructor(IPoolManager poolManager_, address feeBeneficiary_) {
        if (address(poolManager_) == address(0)) revert ZeroAddress();

        poolManager = poolManager_;
        packer = msg.sender;
        seal = new CrateSeal(poolManager_, feeBeneficiary_);
    }

    /// @notice Mint the supply, open the pool, and seal the liquidity. Reverts on
    /// the second call, forever.
    function pack(PackParams calldata params) external returns (address token_, PoolId poolId, uint128 liquidity) {
        if (msg.sender != packer) revert NotPacker();
        if (packed) revert AlreadyPacked();

        // A dynamic fee needs a hook to set it, and this pool has no hook. The
        // pool manager would refuse it too; saying so here names the mistake.
        if (LPFeeLibrary.isDynamicFee(params.fee) || params.fee > LPFeeLibrary.MAX_LP_FEE) revert BadFee();
        if (params.tickSpacing <= 0) revert BadRange();
        if (params.tickLower >= params.tickUpper) revert BadRange();
        if (params.tickLower % params.tickSpacing != 0 || params.tickUpper % params.tickSpacing != 0) {
            revert BadRange();
        }

        token_ = address(new CrateToken(TOKEN_NAME, TOKEN_SYMBOL, SUPPLY, address(seal)));

        PoolKey memory key = PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO, // native ETH, and so always the lower currency
            currency1: Currency.wrap(token_),
            fee: params.fee,
            tickSpacing: params.tickSpacing,
            hooks: IHooks(address(0))
        });
        poolId = key.toId();

        // Anyone can initialise a pool, and the token's address is predictable
        // from this contract's nonce, so an already-priced pool is used as it
        // stands rather than treated as an error — initialising twice would
        // revert and strand this packer. What protects the launch is the
        // single-sided check below, which reads the price that is actually
        // there. A price that would make this launch buy its own supply reverts
        // the whole transaction, and `pack` can be run again against a range
        // computed for the price someone else set.
        (uint160 existingPrice, int24 existingTick,,) = poolManager.getSlot0(poolId);
        int24 tick = existingPrice == 0 ? poolManager.initialize(key, params.sqrtPriceX96) : existingTick;

        // The whole range has to sit below spot. A range reaching above it would
        // need ETH as well, and the seal has none to give — it would revert
        // there rather than here, which is a worse place to learn it.
        if (params.tickUpper > tick) revert NotSingleSided();

        packed = true;
        packedAt = block.timestamp;
        token = token_;
        tickLower = params.tickLower;
        tickUpper = params.tickUpper;
        _key = key;

        liquidity = seal.sealIn(key, params.tickLower, params.tickUpper);

        emit Packed(token_, poolId, liquidity);
    }

    // ------------------------------------------------------------------- views

    /// @notice The pool the supply was packed into. Empty until packed.
    function poolKey() external view returns (PoolKey memory) {
        return _key;
    }

    /// @notice Everything a reader needs to check the crate, in one call.
    function crate()
        external
        view
        returns (
            address token_,
            PoolId poolId,
            address seal_,
            int24 tickLower_,
            int24 tickUpper_,
            uint256 packedAt_,
            uint256 supply
        )
    {
        return (token, _key.toId(), address(seal), tickLower, tickUpper, packedAt, SUPPLY);
    }
}
