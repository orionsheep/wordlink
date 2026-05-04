const { SignJWT } = require('jose');

async function main() {
    // 1. Setup Env and Token
    const secret = process.env.JWT_SECRET || 'your-secret-key-change-this';
    const key = new TextEncoder().encode(secret);
    const id = '4104b1f5-1419-4e9c-9922-6e038534395c'; // Use 'id' for login token
    const token = await new SignJWT({ id, username: 'tester' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(key);

    // 2. Call API with Context in WORD MODE (Category 1)
    console.log('Calling API in Word Mode (Cat 1)...');
    try {
        const res = await fetch('http://localhost:3000/api/ai/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `token=${token}`
            },
            body: JSON.stringify({
                messages: [],
                newMessage: 'Hello Word Context Debug',
                category: 1, // Word Mode
                word: 'apple',
                userContext: {
                    recentHistory: [{word: 'banana'}, {word: 'cherry'}],
                    recentTests: []
                }
            })
        });

        if (res.ok) {
            console.log('Success! Reading stream...');
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            while(true) {
                const {done, value} = await reader.read();
                if(done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                for(const line of lines) {
                    if(line.includes('"type":"debug"')) {
                         console.log('DEBUG EVENT FOUND:', line);
                    }
                }
            }
        } else {
            console.log('Error Response:', await res.text());
        }

    } catch (e) {
        console.error('Fetch Failed:', e);
    }
}

main();
