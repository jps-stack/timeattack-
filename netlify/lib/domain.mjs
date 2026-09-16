export const PARTNER_COUNT = 8;
export const LOGO_UPLOAD_LIMIT_BYTES = 5 * 1024 * 1024;
export const PRODUCT_PAGE_LIMIT_BYTES = 2 * 1024 * 1024;
export const CUSTOM_AD_LIMIT = 12;

export const VALID_LOGO_SLOTS = new Set([
  "sponsor",
  ...Array.from({ length: PARTNER_COUNT }, (_, index) => `partner-${index + 1}`)
]);

export const VALID_CAR_IDS = new Set([
  "audi",
  "ferrari",
  "mclaren",
  "mercedes",
  "red-bull",
  "cadillac",
  "virtual-motors"
]);

export const VALID_AD_IDS = new Set([
  "gt-lite",
  "wheel-stand",
  "motion-plus",
  "gt-elite-lite",
  "open-wheel",
  "monitor-mount"
]);

export function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function publicParticipant(participant) {
  const {
    contact: _contact,
    hasContact: _hasContact,
    isMember: _isMember,
    memberNumber: _memberNumber,
    ...visibleParticipant
  } = participant;
  return visibleParticipant;
}

export function parseTimeMs(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d+):(\d{2})\.(\d{3})$/);
  if (!match) return null;
  return Number(match[1]) * 60000 + Number(match[2]) * 1000 + Number(match[3]);
}

export function getLogoSlot(pathname) {
  const match = pathname.match(/^\/api\/logos\/([^/]+)$/);
  if (!match) return null;
  const slot = decodeURIComponent(match[1]);
  return VALID_LOGO_SLOTS.has(slot) ? slot : null;
}

export function getLogoMeta(config, slot) {
  if (slot === "sponsor") return config.sponsor;
  const index = Number(slot.slice("partner-".length)) - 1;
  return config.partners[index] || null;
}

export function configWithLogo(config, slot, meta) {
  const updatedAt = Date.now();
  if (slot === "sponsor") return { ...config, sponsor: meta, updatedAt };

  const partners = Array.from(
    { length: PARTNER_COUNT },
    (_, index) => config.partners[index] || null
  );
  partners[Number(slot.slice("partner-".length)) - 1] = meta;
  return { ...config, partners, updatedAt };
}

export function cleanLogoFileName(value) {
  const fileName = String(value || "logo.png").split(/[\\/]/).pop();
  return fileName.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180) || "logo.png";
}

export function isPng(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
}

export function validateConfigUpdate(value) {
  const update = { ...value };
  if (update.selectedCar && !VALID_CAR_IDS.has(update.selectedCar)) {
    throw createHttpError(400, "Selección de carro desconocida");
  }
  if (
    update.selectedAds &&
    (!Array.isArray(update.selectedAds) ||
      update.selectedAds.length > VALID_AD_IDS.size ||
      update.selectedAds.some((id) => !VALID_AD_IDS.has(id)))
  ) {
    throw createHttpError(400, "Selección de producto desconocida");
  }
  if (update.adsEnabled !== undefined && typeof update.adsEnabled !== "boolean") {
    throw createHttpError(400, "Estado de anuncios inválido");
  }
  if (update.customAds !== undefined) update.customAds = normalizeCustomAds(update.customAds);
  return update;
}

function normalizeCoautoProductUrl(value) {
  let productUrl;
  try {
    productUrl = new URL(String(value || "").trim());
  } catch {
    throw createHttpError(400, "Ingresa un enlace válido de Coauto Simracing");
  }

  const hostname = productUrl.hostname.toLowerCase().replace(/^www\./, "");
  const productMatch = productUrl.pathname.match(/^\/products\/(\d+)\/([a-z0-9-]+)\/?$/i);
  if (hostname !== "coautosim.com" || !productMatch) {
    throw createHttpError(400, "El enlace debe pertenecer a un producto de www.coautosim.com");
  }

  productUrl.protocol = "https:";
  productUrl.hostname = "www.coautosim.com";
  productUrl.port = "";
  productUrl.search = "";
  productUrl.hash = "";
  productUrl.pathname = `/products/${productMatch[1]}/${productMatch[2]}`;
  return { productId: productMatch[1], productUrl };
}

function normalizeProductImageUrl(value) {
  let imageUrl;
  try {
    imageUrl = new URL(String(value || ""));
  } catch {
    throw createHttpError(422, "El producto no incluye una imagen válida");
  }
  if (!["http:", "https:"].includes(imageUrl.protocol)) {
    throw createHttpError(422, "El producto no incluye una imagen válida");
  }
  imageUrl.protocol = "https:";
  return imageUrl.toString();
}

async function readResponseText(response, limitBytes) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limitBytes) {
      await reader.cancel();
      throw createHttpError(502, "La página del producto es demasiado grande para procesarla");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function findProductJsonLd(html) {
  const scriptPattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const candidates = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.["@graph"])
          ? parsed["@graph"]
          : [parsed];
      const product = candidates.find((candidate) => {
        const type = candidate?.["@type"];
        return type === "Product" || (Array.isArray(type) && type.includes("Product"));
      });
      if (product) return product;
    } catch {
      // Ignore unrelated JSON-LD blocks.
    }
  }
  return null;
}

function productImageFromJsonLd(product) {
  const image = Array.isArray(product?.image) ? product.image[0] : product?.image;
  if (typeof image === "string") return image;
  return image?.url || image?.contentUrl || "";
}

function productBrandFromJsonLd(product) {
  if (typeof product?.brand === "string") return product.brand;
  return product?.brand?.name || "Coauto Simracing";
}

export async function fetchCoautoProduct(value) {
  const requested = normalizeCoautoProductUrl(value);
  let response;
  try {
    response = await fetch(requested.productUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "VirtualMotors-TimeAttack/1.0"
      },
      redirect: "manual",
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    throw createHttpError(502, "No se pudo consultar el producto en Coauto Simracing");
  }
  if (!response.ok) {
    throw createHttpError(502, `Coauto Simracing respondió con HTTP ${response.status}`);
  }

  const html = await readResponseText(response, PRODUCT_PAGE_LIMIT_BYTES);
  const product = findProductJsonLd(html);
  const name = String(product?.name || "").trim().slice(0, 120);
  if (!name) throw createHttpError(422, "No se encontraron los datos públicos del producto");

  const canonical = normalizeCoautoProductUrl(product?.offers?.url || requested.productUrl);
  return {
    id: `coauto-${canonical.productId}`,
    name,
    brand: String(productBrandFromJsonLd(product)).trim().slice(0, 80) || "Coauto Simracing",
    image: normalizeProductImageUrl(productImageFromJsonLd(product)),
    url: canonical.productUrl.toString()
  };
}

function normalizeCustomAds(value) {
  if (!Array.isArray(value) || value.length > CUSTOM_AD_LIMIT) {
    throw createHttpError(400, `Puedes guardar hasta ${CUSTOM_AD_LIMIT} productos personalizados`);
  }

  const products = value.map((item) => {
    const canonical = normalizeCoautoProductUrl(item?.url);
    const name = String(item?.name || "").trim().slice(0, 120);
    if (!name) throw createHttpError(400, "Cada anuncio debe incluir el nombre del producto");
    return {
      id: `coauto-${canonical.productId}`,
      name,
      brand: String(item?.brand || "Coauto Simracing").trim().slice(0, 80),
      image: normalizeProductImageUrl(item?.image),
      url: canonical.productUrl.toString()
    };
  });

  return [...new Map(products.map((product) => [product.url, product])).values()];
}
