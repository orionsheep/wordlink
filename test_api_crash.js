const { SignJWT } = require('jose');

async function main() {
    // 1. Setup Env and Token
    const secret = process.env.JWT_SECRET || 'your-secret-key-change-this';
    const key = new TextEncoder().encode(secret);
    const userId = '4104b1f5-1419-4e9c-9922-6e038534395c'; // From previous debug
    
    console.log('Generating token for user:', userId);
    const token = await new SignJWT({ userId })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(key);

    console.log('Token generated.');

    // 2. Call API
    console.log('Calling API...');
    try {
        const res = await fetch('http://localhost:3000/api/ai/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `token=${token}`
            },
            body: JSON.stringify({
                messages: [],
                newMessage: 'Hello API Debug',
                category: 4
            })
        });

        console.log('Status:', res.status);
        if (res.ok) {
            console.log('Success! Stream started.');
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            while(true) {
                const {done, value} = await reader.read();
                if(done) break;
                console.log('Chunk:', decoder.decode(value));
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
