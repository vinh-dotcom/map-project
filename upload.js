// UPLOAD ẢNH + XÓA ẢNH CŨ
window.uploadImage = async function(markerId, newFile, oldPath) {
  try {
    const folder = `${markerId}`;  // Không cần "marker-images/" vì bucket là marker-images
    const fileName = `${Date.now()}.${newFile.name.split('.').pop()}`;
    const filePath = `${folder}/${fileName}`;

    // Xóa ảnh cũ nếu có
    if (oldPath) {
      const { error: deleteErr } = await supabase.storage
        .from("marker-images")
        .remove([oldPath]);
      if (deleteErr) console.error("Xóa ảnh cũ lỗi:", deleteErr);
    }

    // Upload file mới
    const { error: uploadErr } = await supabase.storage
      .from("marker-images")
      .upload(filePath, newFile, {
        cacheControl: "3600",
        upsert: false
      });

    if (uploadErr) {
      console.error("Upload error:", uploadErr);
      throw uploadErr;
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
    console.error("UploadImage failed:", err);
    alert("Lỗi upload ảnh: " + (err.message || "Không xác định"));
    return null;
  }
};
