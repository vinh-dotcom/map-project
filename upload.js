// Upload image for markers — with delete old file
async function uploadImage(userId, file, oldPath = null) {
  if (!file) return { path: null, url: null };

  // Delete old file first
  if (oldPath) {
    console.log("Deleting old file:", oldPath);
    await supabase.storage.from("marker-images").remove([oldPath]);
  }

  const filename = `${Date.now()}.jpg`;
  const path = `${userId}/${filename}`;

  const { error } = await supabase.storage
    .from("marker-images")
    .upload(path, file);

  if (error) {
    console.error("Upload error", error);
    throw error;
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/marker-images/${path}`;

  return { path, url: publicUrl };
}
