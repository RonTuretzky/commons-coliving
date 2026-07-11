// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {GatheringEscrow} from "../src/GatheringEscrow.sol";

contract GatheringEscrowTest is Test {
    GatheringEscrow esc;
    address host = address(0xA11CE);
    address alice = address(0xB0B);
    address bob = address(0xCAFE);
    bytes32 id = keccak256("e-stoop-mixer");
    uint64 start;
    uint96 constant DEP = 15 ether;

    function setUp() public {
        esc = new GatheringEscrow();
        start = uint64(block.timestamp + 5 days);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.prank(host);
        esc.create(id, start, DEP);
    }

    function test_depositAndClaimAfterStart() public {
        vm.prank(alice);
        esc.deposit{value: DEP}(id);
        vm.prank(bob);
        esc.deposit{value: DEP}(id);
        vm.warp(start + 1);
        uint256 before = host.balance;
        vm.prank(host);
        esc.claim(id);
        assertEq(host.balance - before, uint256(DEP) * 2);
    }

    function test_attendeeCanWithdrawBeforeStart() public {
        vm.prank(alice);
        esc.deposit{value: DEP}(id);
        uint256 before = alice.balance;
        vm.prank(alice);
        esc.withdraw(id);
        assertEq(alice.balance - before, DEP);
    }

    function test_cancelMakesEveryoneRefundable_evenAfterStart() public {
        vm.prank(alice);
        esc.deposit{value: DEP}(id);
        vm.prank(host);
        esc.cancel(id);
        vm.warp(start + 30 days);
        uint256 before = alice.balance;
        vm.prank(alice);
        esc.withdraw(id);
        assertEq(alice.balance - before, DEP);
    }

    function test_hostCannotClaimWhenCancelled() public {
        vm.prank(alice);
        esc.deposit{value: DEP}(id);
        vm.prank(host);
        esc.cancel(id);
        vm.warp(start + 1);
        vm.prank(host);
        vm.expectRevert(GatheringEscrow.AlreadyCancelled.selector);
        esc.claim(id);
    }

    function test_noWithdrawAfterStartWithoutCancel() public {
        vm.prank(alice);
        esc.deposit{value: DEP}(id);
        vm.warp(start + 1);
        vm.prank(alice);
        vm.expectRevert(GatheringEscrow.TooLate.selector);
        esc.withdraw(id);
    }

    function test_wrongAmountReverts() public {
        vm.prank(alice);
        vm.expectRevert(GatheringEscrow.BadAmount.selector);
        esc.deposit{value: 1 ether}(id);
    }

    function test_doubleDepositReverts() public {
        vm.startPrank(alice);
        esc.deposit{value: DEP}(id);
        vm.expectRevert(GatheringEscrow.BadAmount.selector);
        esc.deposit{value: DEP}(id);
        vm.stopPrank();
    }

    function test_onlyHostCancelsAndClaims() public {
        vm.prank(alice);
        vm.expectRevert(GatheringEscrow.NotHost.selector);
        esc.cancel(id);
        vm.warp(start + 1);
        vm.prank(alice);
        vm.expectRevert(GatheringEscrow.NotHost.selector);
        esc.claim(id);
    }

    function test_claimBeforeStartReverts() public {
        vm.prank(alice);
        esc.deposit{value: DEP}(id);
        vm.prank(host);
        vm.expectRevert(GatheringEscrow.TooEarly.selector);
        esc.claim(id);
    }

    function test_duplicateCreateReverts() public {
        vm.prank(bob);
        vm.expectRevert(GatheringEscrow.Exists.selector);
        esc.create(id, start, DEP);
    }
}
