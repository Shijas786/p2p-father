import { SafeProvider, predictSafeAddress } from '@safe-global/protocol-kit';

async function test() {
    try {
        const safeProvider = await SafeProvider.init({ provider: 'https://mainnet.base.org' });
        const safeAccountConfig = {
            owners: ['0x1111111111111111111111111111111111111111'],
            threshold: 1
        };
        const address = await predictSafeAddress({
            safeProvider,
            chainId: BigInt(8453),
            safeAccountConfig
        });
        console.log("Predicted Address:", address);
    } catch (e) {
        console.error(e);
    }
}
test();
