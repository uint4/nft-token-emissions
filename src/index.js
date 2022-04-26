const getData = require("./data");
const airdrop = require("./airdrop");
const {sum} = require("mathjs")
const { maxAllocation } = require("./config");

const main = async (ignore_traits = []) => {
    let {metadata: data, snapshot} = await getData();
    let counts = {};
    let rarities = {};
    let rewards = {};

    process.stdout.write("Calculating rewards... ");

    // Get the number of times that each score occurs
    Object.values(data).map(traits =>
        traits.map(({trait_type: type, value}) => {
            if (ignore_traits.includes(type)) return;
            if (!counts[[type, value]]) { counts[[type, value]] = 0; }
            counts[[type, value]]++;
        })
    );

    // Get the sum of proportional trait occurences. Set the minimum and maximum values.
    Object.entries(data).map(([id, traits]) => {
        rarities[id] = 0;
        traits.map(({trait_type: type, value}) => {
            rarities[id] += 1 / counts[[type, value]];
        })
    })
    let min = Math.min.apply(null, Object.values(rarities));
    let max = Math.max.apply(null, Object.values(rarities));

    // Calculate weighted rewards for each id
    Object.entries(rarities).map(([id, value]) => {
        rewards[id] = ((value - min) / (max - min) * 0.75 + 0.25) * maxAllocation
    });
    process.stdout.write("Done.\n")

    await airdrop(snapshot, rewards);
}

main();
