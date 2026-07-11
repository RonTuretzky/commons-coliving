// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title GatheringEscrow — non-custodial deposits for colive.fun gatherings
/// @notice Deposits are held by this contract, never by the platform:
///         attendees can pull out before start; the host cancelling makes
///         everyone refundable forever; an uncancelled gathering lets the
///         host claim the pot after start. Native xDai on Gnosis Chain.
contract GatheringEscrow {
    struct Gathering {
        address host;
        uint64 startsAt;
        uint96 deposit;
        bool cancelled;
        uint128 pot;
    }

    mapping(bytes32 => Gathering) public gatherings;
    mapping(bytes32 => mapping(address => uint96)) public deposits;

    event Created(bytes32 indexed id, address indexed host, uint64 startsAt, uint96 deposit);
    event Deposited(bytes32 indexed id, address indexed who, uint96 amount);
    event Withdrawn(bytes32 indexed id, address indexed who, uint96 amount);
    event Cancelled(bytes32 indexed id);
    event Claimed(bytes32 indexed id, address indexed host, uint128 amount);

    error Exists();
    error NotFound();
    error NotHost();
    error BadAmount();
    error TooLate();
    error TooEarly();
    error AlreadyCancelled();
    error NothingToWithdraw();
    error TransferFailed();

    function create(bytes32 id, uint64 startsAt, uint96 deposit_) external {
        if (gatherings[id].host != address(0)) revert Exists();
        if (startsAt <= block.timestamp) revert TooLate();
        gatherings[id] = Gathering(msg.sender, startsAt, deposit_, false, 0);
        emit Created(id, msg.sender, startsAt, deposit_);
    }

    function deposit(bytes32 id) external payable {
        Gathering storage g = gatherings[id];
        if (g.host == address(0)) revert NotFound();
        if (g.cancelled) revert AlreadyCancelled();
        if (block.timestamp >= g.startsAt) revert TooLate();
        if (msg.value != g.deposit || msg.value == 0) revert BadAmount();
        if (deposits[id][msg.sender] != 0) revert BadAmount();
        deposits[id][msg.sender] = uint96(msg.value);
        g.pot += uint128(msg.value);
        emit Deposited(id, msg.sender, uint96(msg.value));
    }

    /// Before start: change your mind, money comes back.
    /// After a cancellation: always refundable, no deadline.
    function withdraw(bytes32 id) external {
        Gathering storage g = gatherings[id];
        uint96 amt = deposits[id][msg.sender];
        if (amt == 0) revert NothingToWithdraw();
        if (!g.cancelled && block.timestamp >= g.startsAt) revert TooLate();
        deposits[id][msg.sender] = 0;
        g.pot -= amt;
        (bool ok,) = msg.sender.call{value: amt}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(id, msg.sender, amt);
    }

    function cancel(bytes32 id) external {
        Gathering storage g = gatherings[id];
        if (g.host != msg.sender) revert NotHost();
        if (g.cancelled) revert AlreadyCancelled();
        g.cancelled = true;
        emit Cancelled(id);
    }

    function claim(bytes32 id) external {
        Gathering storage g = gatherings[id];
        if (g.host != msg.sender) revert NotHost();
        if (g.cancelled) revert AlreadyCancelled();
        if (block.timestamp < g.startsAt) revert TooEarly();
        uint128 amt = g.pot;
        if (amt == 0) revert NothingToWithdraw();
        g.pot = 0;
        (bool ok,) = msg.sender.call{value: amt}("");
        if (!ok) revert TransferFailed();
        emit Claimed(id, msg.sender, amt);
    }
}
