// Prepara a imagem da planta para envio: valida o formato e reduz imagens grandes (máx. 2400 px no maior lado).
const MAX_SIDE = 2400;
const readAsDataURL = f => new Promise((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.onerror = () => fail(new Error('Não foi possível ler o arquivo.'));
  r.readAsDataURL(f);
});
const load = src => new Promise((ok, fail) => {
  const i = new Image();
  i.onload = () => ok(i);
  i.onerror = () => fail(new Error('Imagem inválida ou corrompida.'));
  i.src = src;
});

export async function prepareImage(file) {
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) throw new Error('Formato não suportado. Use PNG, JPG, WEBP ou SVG.');
  const url = await readAsDataURL(file);
  if (file.type === 'image/svg+xml') {
    if (file.size > 3e6) throw new Error('O SVG passa de 3 MB. Exporte uma versão mais leve.');
    return url;
  }
  const img = await load(url);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  if (scale === 1 && file.size <= 1.5e6) return url;
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.9);
}
