export async function resolve(specifier,context,nextResolve){
  if(specifier==='@vercel/blob')return {url:new URL('./blob-mock.mjs',import.meta.url).href,shortCircuit:true};
  return nextResolve(specifier,context);
}
