// No production credentials, network or Blob store is used in these tests.
const blobs=new Map();let version=0;
export class BlobPreconditionFailedError extends Error {}
export class BlobNotFoundError extends Error {}
export class BlobError extends Error {}
export function reset(){blobs.clear();version=0}
export function read(path){const v=blobs.get(path);return v?JSON.parse(v.body):null}
export async function head(path){
  const v=blobs.get(path);if(!v)throw new BlobNotFoundError();
  return {pathname:path,etag:v.etag};
}
export async function get(path){
  const v=blobs.get(path);if(!v)return null;
  // Real private Blob downloads can use a weak HTTP ETag after compression,
  // whereas head()/put() return the strong storage ETag used for ifMatch.
  return {statusCode:200,blob:{etag:'W/'+v.etag},stream:new Response(v.body).body};
}
export async function put(path,body,options={}){
  // Yield so the API tests exercise actual competing read/modify/write calls.
  await new Promise(resolve=>setTimeout(resolve,2));
  const previous=blobs.get(path);
  if(options.ifMatch&&previous?.etag!==options.ifMatch)throw new BlobPreconditionFailedError();
  if(previous&&!options.allowOverwrite&&!options.ifMatch)throw new BlobError('Vercel Blob: This blob already exists, use `allowOverwrite: true` if you want to overwrite it.');
  const row={body:String(body),etag:'"e'+(++version)+'"',uploadedAt:new Date()};blobs.set(path,row);
  return {url:'https://test.invalid/'+path,pathname:path,etag:row.etag};
}
export async function list({prefix=''}={}){return {blobs:[...blobs].filter(([p])=>p.startsWith(prefix)).map(([pathname,row])=>({pathname,url:'https://test.invalid/'+pathname,size:row.body.length,uploadedAt:row.uploadedAt})),hasMore:false}}
export async function del(path){for(const p of Array.isArray(path)?path:[path])blobs.delete(String(p).replace('https://test.invalid/',''))}
