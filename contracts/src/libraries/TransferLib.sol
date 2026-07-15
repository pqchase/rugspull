// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library TransferLib {
    error TransferFailed();
    error TransferFromFailed();
    error ApproveFailed();

    function safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(bytes4(0xa9059cbb), to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(bytes4(0x23b872dd), from, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFromFailed();
    }

    function safeApprove(address token, address spender, uint256 amount) internal {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(bytes4(0x095ea7b3), spender, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert ApproveFailed();
    }
}
