// upload.js: upload file to Supabase Storage and return image path or signed URL

async function uploadImage(file, userId) {
if (!file) return null;
const timestamp = Date.now();
const ext = file.name.split('.').pop();
const filePath = `${userId}/${timestamp}.${ext}`;

const { data, error } = await supabase.storage
.from('marker-images')
.upload(filePath, file, { cacheControl: '3600', upsert: false });

if (error) {
console.error('Upload error', error);
throw error;
}
return data.path; // store this in DB (image_path)
}

// get signed url for display
async function getImageUrl(path) {
if (!path) return null;
// create signed URL valid for 1 hour
const { data, error } = await supabase.storage
.from('marker-images')
.createSignedUrl(path, 60 * 60);

if (error) {
console.error('SignedUrl error', error);
return null;
}
return data.signedUrl;
}