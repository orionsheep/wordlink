import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TEST_USER = {
    username: 'test',
    password: 'LPT_test_account',
    secretKey: 'M4sQ9vTe2LxH7pKd5Wc8nR3gY0bZ6jF'
};

const WORDS = [
    'apple', 'banana', 'cherry', 'date', 'elderberry', 'fig', 'grape', 'honeydew',
    'kiwi', 'lemon', 'mango', 'nectarine', 'orange', 'papaya', 'quince', 'raspberry',
    'strawberry', 'tangerine', 'ugli', 'vanilla', 'watermelon', 'xigua', 'yam', 'zucchini',
    'abandon', 'ability', 'able', 'abortion', 'about', 'above', 'abroad', 'absence',
    'absolute', 'absolutely', 'absorb', 'abuse', 'academic', 'accept', 'access', 'accident',
    'accompany', 'accomplish', 'according', 'account', 'accurate', 'accuse', 'achieve', 'achievement'
];

async function main() {
    console.log('Creating test user...');

    // Hash password
    const hashedPassword = await bcrypt.hash(TEST_USER.password, 10);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
        where: { username: TEST_USER.username }
    });

    let userId;

    if (existingUser) {
        console.log('User exists, updating...');
        const user = await prisma.user.update({
            where: { username: TEST_USER.username },
            data: {
                password: hashedPassword,
                secretKey: TEST_USER.secretKey
            }
        });
        userId = user.id;

        // Clear existing records
        await prisma.quizRecord.deleteMany({
            where: { userId }
        });
        await prisma.wordVisit.deleteMany({
            where: { userId }
        });
    } else {
        console.log('Creating new user...');
        const user = await prisma.user.create({
            data: {
                username: TEST_USER.username,
                password: hashedPassword,
                secretKey: TEST_USER.secretKey
            }
        });
        userId = user.id;
    }

    console.log(`User created/updated with ID: ${userId}`);

    // Generate Quiz Records
    console.log('Generating quiz records...');
    const records = [];
    const now = new Date();

    for (let i = 0; i < 50; i++) {
        const word = WORDS[Math.floor(Math.random() * WORDS.length)];
        const testType = Math.random() > 0.5 ? 1 : 2; // 1=Spelling, 2=Recall
        let score = 0;

        if (testType === 1) {
            // Spelling: 0 or 2
            score = Math.random() > 0.3 ? 2 : 0; // 70% success
        } else {
            // Recall: 0, 1, 2
            const r = Math.random();
            if (r > 0.6) score = 2; // Easy
            else if (r > 0.3) score = 1; // Hard
            else score = 0; // Unknown
        }

        // Random time in last 7 days
        const time = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);

        records.push({
            userId,
            word,
            testType,
            score,
            timestamp: time
        });
    }

    await prisma.quizRecord.createMany({
        data: records
    });

    console.log(`Created ${records.length} quiz records.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
