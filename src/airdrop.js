const ethers = require("ethers");
const { MerkleTree } = require("merkletreejs");
const solc = require("solc");
const fs = require("fs");
let coder = ethers.utils.defaultAbiCoder;
const { tokenName, tokenSymbol, providerUrl } = require("./config");
const path = require("path");


const erc20 = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract Token is ERC20, AccessControl {
    bytes32 public constant MINT_AUTHORITY = keccak256("MINT_AUTHORITY");
    bytes32 public immutable merkleRoot;
    mapping(uint256 => uint256) private claimedBitMap;

    event Claimed(uint256 index, address account, uint256 amount);

    constructor(bytes32 _merkleRoot) ERC20("${tokenName}", "${tokenSymbol}") {
        _setupRole(MINT_AUTHORITY, msg.sender);
        merkleRoot = _merkleRoot;
    }

    function mint(address to, uint256 amount) public {
        require(hasRole(MINT_AUTHORITY, msg.sender), "!MINT_AUTHORITY");
        _mint(to, amount);
    }

    function isClaimed(uint256 index) public view returns (bool) {
        uint256 claimedWordIndex = index / 256;
        uint256 claimedBitIndex = index % 256;
        uint256 claimedWord = claimedBitMap[claimedWordIndex];
        uint256 mask = (1 << claimedBitIndex);
        return claimedWord & mask == mask;
    }

    function _setClaimed(uint256 index) private {
        uint256 claimedWordIndex = index / 256;
        uint256 claimedBitIndex = index % 256;
        claimedBitMap[claimedWordIndex] = claimedBitMap[claimedWordIndex] | (1 << claimedBitIndex);
    }

    function claim(uint256 index, address account, uint256 amount, bytes32[] calldata merkleProof) external {
        require(!isClaimed(index), 'MerkleDistributor: Drop already claimed.');
        bytes32 node = keccak256(abi.encodePacked(index, account, amount));
        require(MerkleProof.verify(merkleProof, merkleRoot, node), 'MerkleDistributor: Invalid proof.');
        _setClaimed(index);
        _mint(account, amount);

        emit Claimed(index, account, amount);
    }
}
`

const findImports = (fp) => {
    let contents = {};
    contents['contents'] = fs.readFileSync(path.resolve('./node_modules', fp), 'utf8');
    return contents
}


module.exports = async (snapshot, rewards) => {
    let snapshotRewards = {}
    snapshot.map((address, idx) => {
        snapshotRewards[address] = snapshotRewards[address] ?
        snapshotRewards[address] + rewards[idx+1] :
        rewards[idx+1];
    });
    
    let merkleEntries = Object.entries(snapshotRewards).map(([address, amount], index) => {
        return ethers.utils.solidityKeccak256(['uint256', 'address', 'uint256'], [index, address, ethers.utils.parseUnits(String(amount), 18).toString()]);
    });

    let merkleTree = new MerkleTree(merkleEntries, require('keccak256'), { sort: true });
    let merkleRoot = merkleTree.getHexRoot();

    const input = {
        language: 'Solidity',
        sources: {
            'token.sol': {
              content: erc20
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
      
      const contract = JSON.parse(solc.compile(JSON.stringify(input), {import: findImports}))['contracts']['token.sol']['Token'];
      const abi = contract.abi;
      const bytecode = contract.evm.bytecode.object;

      let provider = new ethers.providers.JsonRpcProvider(providerUrl);
      let signer = new ethers.Wallet(process.argv?.[3] || ethers.utils.randomBytes(32), provider);
      
      let calldata = '0x'.concat(bytecode.concat(
          coder.encode(['bytes32'], [merkleRoot]).slice(2)
      ));

      let nonce = await signer.getTransactionCount();

      let token = signer.call({
          data: calldata,
          nonce,
          gasPrice: ethers.utils.parseUnits('150'),
      });

      // TODO return address
      return token;
}