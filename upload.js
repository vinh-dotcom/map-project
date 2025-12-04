// UPLOAD ẢNH + XÓA ẢNH CŨ
window.uploadImage = async function(markerId, newFile, oldPath) {
  try {
    const folder = `marker-images/${markerId}`;
    const fileName = `${Date.now()}.jpg`;
    const filePath = `${folder}/${fileName}`;

    // Xóa ảnh cũ nếu có
    if (oldPath) {
      await supabase.storage
        .from("marker-images")
        .remove([oldPath]);
    }

    // Upload file mới
    const { error: uploadErr } = await supabase.storage
      .from("marker-images")
      .upload(filePath, newFile, {
        cacheControl: "3600",
        upsert: false
      });

    if (uploadErr) {
      console.error("Upload error", uploadErr);
      return null;
    }

    // Lấy URL public
    const { data } = supabase.storage
      .from("marker-images")
      .getPublicUrl(filePath);

    return {
      url: data.publicUrl,
      path: filePath
    };
  } catch (err) {
    console.error("UploadImage failed", err);
    return null;
  }
};
