// Resets the local database to the demo campaign. Usage: npm run seed
import { seedDemo } from '../server/seed.js';

const c = seedDemo({ receiver: process.env.PAYPAL_TEST_RECEIVER });
console.log(`Seeded "${c.name}" (${c.id}). Start the app with npm run dev.`);
