import { createClient } from 'redis';

let client;

async function getRedisClient() {
  if (!client) {
    client = createClient({
      url: process.env.REDIS_URL,
    });

    client.on('error', (err) => console.error('Redis Client Error', err));

    try {
      await client.connect();
      console.log('Connected to Redis');
    } catch (err) {
      console.error('Failed to connect to Redis:', err);
      client = null;
    }
  }
  return client;
}

export default getRedisClient;