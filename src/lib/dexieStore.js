import Dexie from 'dexie';

// Database for image persistence
export const db = new Dexie('ImageGraphDB');

db.version(1).stores({
  images: 'id,imageData', // id: nodeId, imageData: base64 string
});

// Add/update image
export const saveImage = async (id, imageData) => {
  return db.images.put({ id, imageData });
};

// Get image by id
export const getImage = async (id) => {
  const entry = await db.images.get(id);
  return entry ? entry.imageData : null;
};

// Delete image
export const deleteImage = async (id) => {
  return db.images.delete(id);
};

// Clear all images from database
export const clearImages = async () => {
  console.log('Clearing all images from Dexie...');
  await db.images.clear();
  console.log('Images cleared successfully');
};

// Reset entire database
export const resetDatabase = async () => {
  console.log('Resetting Dexie database...');
  await db.delete();
  console.log('Database reset successfully');
};