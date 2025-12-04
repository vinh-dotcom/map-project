// upload.js

async function uploadImage(file, userId) {
  if (!file) return null;
  const timestamp = Date.now();
  const ext = (file.name || '').split('.').pop();
  const path = `${userId}/${timestamp}.${ext}`;
  try {
    const { data, error } = await supabase.storage
      .from('marker-images')
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (error) {
      console.error('Upload error', error);
      throw error;
    }
    return data.path;
  } catch (err) {
    console.error('UploadImage failed', err);
    throw err;
  }
}

async function getImageUrl(path) {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage
      .from('marker-images')
      .createSignedUrl(path, 60 * 60); // 1 hour
    if (error) {
      console.error('SignedUrl error', error);
      return null;
    }
    return data.signedUrl;
  } catch (err) {
    console.error('getImageUrl error', err);
    return null;
  }
}
