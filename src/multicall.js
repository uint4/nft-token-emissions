const solc = require("solc");

const multicall = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;
pragma experimental ABIEncoderV2;

contract MultiCall {
  constructor(
    address[] memory targets,
    bytes[] memory datas
  ) {
    uint256 len = targets.length;
    require(datas.length == len, "Error: Array lengths do not match.");

    bytes[] memory returnDatas = new bytes[](len);
    bytes memory data;

    for (uint256 i = 0; i < len; i++) {
      address target = targets[i];
      data = datas[i];
      (bool success, bytes memory returnData) = target.call(data);
      if (!success) {
        returnDatas[i] = bytes("");
      } else {
        returnDatas[i] = returnData;
      }
    }
    data = abi.encode(block.number, returnDatas);
    assembly { return(add(data, 32), data) }
  }
}
`
const input = {
  language: 'Solidity',
  sources: {
    'multicall.sol': {
      content: multicall
    }
  },
  settings: {
    outputSelection: {
      '*': {
        '*': ['*']
      }
    }
  }
};

const contract = JSON.parse(solc.compile(JSON.stringify(input))).contracts['multicall.sol']['MultiCall'];

module.exports = {
  abi: contract.abi,
  bytecode: contract.evm.bytecode.object,
}
