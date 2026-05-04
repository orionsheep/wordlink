const { SignJWT } = require('jose');

async function main() {
    // 1. Setup Env and Token
    const secret = process.env.JWT_SECRET || 'your-secret-key-change-this';
    const key = new TextEncoder().encode(secret);
    const id = '4104b1f5-1419-4e9c-9922-6e038534395c'; // Use 'id' for login token
    
    console.log('Generating token for user ID:', id);
    const token = await new SignJWT({ id, username: 'tester' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(key);

    console.log('Token generated.');

    // 2. Call API with Context
    console.log('Calling API with Context...');
    try {
        const res = await fetch('http://localhost:3000/api/ai/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `token=${token}`
            },
            body: JSON.stringify({
                messages: [],
                newMessage: 'Hello Context Debug',
                category: 3, // Global Call
                userContext: {
                    recentHistory: [{word: 'apple'}, {word: 'banana'}],
                    recentTests: [{word: 'cat', score: 10}]
                }
            })
        });

        console.log('Status:', res.status);
        if (res.ok) {
            console.log('Success! Reading stream...');
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            while(true) {
                const {done, value} = await reader.read();
                if(done) break;
                const chunk = decoder.decode(value);
                // Look for debug info
                const lines = chunk.split('\n');
                for(const line of lines) {
                    if(line.includes('"type":"debug"')) {
                         console.log('DEBUG EVENT FOUND:', line);
                    }
                }
            }
        } else {
            console.log('Error Response:');
            const text = await res.text();
            console.log(text);
        }

    } catch (e) {
        console.error('Fetch Failed:', e);
    }
}

main();
