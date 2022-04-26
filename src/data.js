const ethers = require("ethers");
const axios = require('axios');
let coder = ethers.utils.defaultAbiCoder;
const { infuraId, nftAddress, maxQuery, maxWebQuery } = require('./config');
const contract = require("./multicall");

const formatReq = (data) => {return {data, to: nftAddress}};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = async () => {
    process.stdout.write("Initializing... ");
    let provider = new ethers.providers.WebSocketProvider("wss://mainnet.infura.io/ws/v3/".concat(infuraId));

    let totalSupplyFunc = ethers.utils.id('totalSupply()').slice(0,10);
    let tokenOwnerFunc = ethers.utils.id('ownerOf(uint256)').slice(0,10);
    let tokenUriFunc = ethers.utils.id('tokenURI(uint256)').slice(0,10);

    let blockHeight = await provider.getBlockNumber();

    process.stdout.write("Done.\nDetecting number of tokens... ")
    let rawTotalSupply = await provider.call(formatReq(totalSupplyFunc));
    let totalSupply = parseInt( coder.decode(['uint256'], rawTotalSupply) );

    process.stdout.write(`Done. Detected ${totalSupply} tokens.\nTaking Snapshot and fetching URIs... `)
    let owners = Array(totalSupply).fill().map((_,idx) => tokenOwnerFunc.concat(coder.encode(["uint256"], [idx+1]).slice(2)));
    let uris = Array(totalSupply).fill().map((_, idx) => tokenUriFunc.concat(coder.encode(["uint256"], [idx+1]).slice(2)));
    let targets = Array(2 * totalSupply).fill(nftAddress);
    let calls = owners.concat(uris);

    let urls = [];
    let snapshot = [];
    let data = [];
    while (calls.length) {
        let call = '0x'.concat(contract.bytecode.concat(
            coder.encode(['address[]', 'bytes[]'], [targets.splice(0, maxQuery), calls.splice(0, maxQuery)]).slice(2)
        ));
        data = data.concat(coder.decode( ['uint256', 'bytes[]'], await provider.call({ data: call }, blockHeight) )[1]);
    }

    data.map(result => {
        totalSupply !== snapshot.length ?
            snapshot.push(coder.decode(['address'], result)[0])
            : urls.push(coder.decode(['string'], result)[0])
    });

    process.stdout.write("Done.\nFetching Metadata for each token... ")
    let metadata = {};
    while (urls.length) {
        (await axios.all(urls.splice(0, maxWebQuery).map(axios.get))).map(res => {
            if (res.status != 200) {
                console.log('One or more of the URLs threw an error. Please try again.');
                process.exit(1);
            } else { metadata[res.data.id] = res.data.attributes }
        })
    }
    process.stdout.write("Done.\n")

    return {metadata, snapshot}
}