import { db } from '../src/db/client';

async function main() {
    const supabase = (db as any).getClient();

    console.log('Checking for payment_proofs table...');
    const { data: ppData, error: ppError } = await supabase
        .from('payment_proofs')
        .select('*')
        .limit(1);

    if (ppError) {
        console.error('Error accessing payment_proofs:', ppError);
    } else {
        console.log('Successfully accessed payment_proofs table.');
    }

    console.log('\nChecking for fees table...');
    const { data: feesData, error: feesError } = await supabase
        .from('fees')
        .select('*')
        .limit(1);

    if (feesError) {
        console.error('Error accessing fees:', feesError);
    } else {
        console.log('Successfully accessed fees table.');
    }
}

main().catch(console.error);
