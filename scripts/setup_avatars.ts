import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
    console.log('Creating "avatars" bucket...');

    const { data, error } = await supabase
        .storage
        .createBucket('avatars', {
            public: true,
            fileSizeLimit: 5242880, // 5MB
            allowedMimeTypes: ['image/*']
        });

    if (error) {
        if (error.message.includes('already exists')) {
            console.log('Bucket "avatars" already exists.');
        } else {
            console.error('Error creating bucket:', error);
        }
    } else {
        console.log('Bucket "avatars" created successfully.');
    }

    console.log('\n--- MANUAL STEP REQUIRED ---');
    console.log('Please run the following SQL in your Supabase SQL Editor to update the schema:');
    console.log('ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;');
}

main();
