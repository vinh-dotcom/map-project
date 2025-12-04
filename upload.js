// upload.js
// uploadImage(userId, file, oldPath) -> { path, publicUrl }
// Uses supabase.storage.from('marker-images')
async function uploadImage(userId, file, oldPath = null) {
  if (!file) return { path: null, publicUrl: null };

  try {
    // delete old if exists
    if (oldPath) {
      try {
        await supabase.storage.from('marker-images').remove([oldPath]);
      } catch (e) {
        console.warn('Could not remove old image', e);
      }
    }

    const ext = (file.name || '').split('.').pop();
    const filename = `${Date.now()}.${ext}`;
    const path = `${userId}/${filename}`;

    const { data, error } = await supabase.storage
      .from('marker-images')
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (error) {
      console.error('Upload error', error);
      throw error;
    }

    // obtain public URL (works if bucket is public or you set public policy)
    const { data: pub } = await supabase.storage.from('marker-images').getPublicUrl(path);
    const publicUrl = pub?.publicUrl || null;

    return { path, publicUrl };
  } catch (err) {
    console.error('uploadImage failed', err);
    throw err;
  }
}

// helper to get public url from either image_url or image_path
async function resolveImagePublicUrl(image_url, image_path) {
  if (image_url) return image_url;
  if (!image_path) return null;
  const { data: pub } = await supabase.storage.from('marker-images').getPublicUrl(image_path);
  return pub?.publicUrl || null;
}
