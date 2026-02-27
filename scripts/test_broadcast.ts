import { broadcastAd } from '../src/bot';

const order = {
  id: "test1234",
  type: "sell",
  amount: 100,
  rate: 90,
  token: "USDC",
  chain: "base"
};

const user = {
  username: "test_user_broadcast"
};

async function main() {
    await broadcastAd(order, user);
    console.log("Broadcasted");
    process.exit(0);
}

main().catch(console.error);
