const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.chatSession.findMany({
    include: { messages: true },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log('Recent chat sessions:');
  console.log(JSON.stringify(sessions, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
