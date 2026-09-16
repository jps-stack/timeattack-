const CARS = Object.freeze([
  { id: "audi", team: "Audi", image: "/assets/cars/audi.webp", accent: "#f3f4f6" },
  { id: "ferrari", team: "Ferrari", image: "/assets/cars/ferrari.webp", accent: "#ff1e2d" },
  { id: "mclaren", team: "McLaren", image: "/assets/cars/mclaren.webp", accent: "#ff8700" },
  { id: "mercedes", team: "Mercedes", image: "/assets/cars/mercedes.webp", accent: "#00d2be" },
  {
    id: "red-bull",
    team: "Red Bull Racing",
    image: "/assets/cars/red-bull.webp",
    accent: "#3671c6"
  },
  { id: "cadillac", team: "Cadillac", image: "/assets/cars/cadillac.webp", accent: "#c7a86b" },
  {
    id: "virtual-motors",
    team: "Virtual Motors",
    detail: "Monoplaza VM",
    image: "/assets/cars/virtual-motors.webp?v=2",
    accent: "#e10600"
  }
]);

const PRODUCTS = Object.freeze([
  {
    id: "gt-lite",
    name: "GT Lite Cockpit",
    brand: "Next Level Racing",
    image: "/assets/products/gt-lite.webp",
    url: "https://www.coautosim.com/products/122/gt-lite-cockpit"
  },
  {
    id: "wheel-stand",
    name: "Wheel Stand Racer",
    brand: "Next Level Racing",
    image: "/assets/products/wheel-stand.webp",
    url: "https://www.coautosim.com/products/137/wheel-stand-racer"
  },
  {
    id: "motion-plus",
    name: "Motion Plus Platform",
    brand: "Next Level Racing",
    image: "/assets/products/motion-platform.webp",
    url: "https://www.coautosim.com/products/147/motion-plus-platform"
  },
  {
    id: "gt-elite-lite",
    name: "GT Elite Lite",
    brand: "Next Level Racing",
    image: "/assets/products/gt-elite-lite.webp",
    url: "https://www.coautosim.com/products/202/gt-elite-lite-wheel-plate-edition"
  },
  {
    id: "open-wheel",
    name: "Open Wheel Add On",
    brand: "Thrustmaster",
    image: "/assets/products/open-wheel.webp",
    url: "https://www.coautosim.com/products/87/open-wheel-add-on-ww"
  },
  {
    id: "monitor-mount",
    name: "Elite Direct Monitor Mount",
    brand: "Next Level Racing",
    image: "/assets/products/monitor-mount.webp",
    url: "https://www.coautosim.com/products/196/elite-direct-monitor-mount"
  }
]);

const DEFAULT_CAR_ID = "audi";
const DEFAULT_AD_IDS = ["gt-lite", "wheel-stand", "open-wheel"];
const AD_ROTATION_MS = 12000;
const DASHBOARD_SYNC_MS = 1500;
const SITE_TITLE = "VM Time Attack";
const CONFIG_ENDPOINT = "/api/config";
const CONFIG_CHANNEL_NAME = "ta-config-updates";
const CONFIG_STORAGE_KEY = "ta-live-config";
let adminMounting = false;
let dashboardSyncing = false;
let dashboardProducts = [];
let dashboardProductIndex = 0;
let dashboardAdSignature = "";
let configChannel = null;

function findCar(id) {
  return CARS.find((car) => car.id === id) || CARS[0];
}

function findProduct(id) {
  return PRODUCTS.find((product) => product.id === id) || null;
}

function normalizeProductIds(ids) {
  const source = Array.isArray(ids) ? ids : DEFAULT_AD_IDS;
  return [...new Set(source.filter((id) => findProduct(id)))];
}

function normalizeCustomAds(products) {
  if (!Array.isArray(products)) return [];
  return products.filter(
    (product) =>
      product &&
      typeof product.id === "string" &&
      typeof product.name === "string" &&
      typeof product.brand === "string" &&
      typeof product.image === "string" &&
      typeof product.url === "string"
  );
}

function getConfiguredProducts(config) {
  const products = [
    ...normalizeProductIds(config.selectedAds).map((id) => ({ ...findProduct(id), source: "preset" })),
    ...normalizeCustomAds(config.customAds).map((product) => ({ ...product, source: "custom" }))
  ];
  const unique = new Map();
  products.forEach((product) => {
    if (!unique.has(product.url)) unique.set(product.url, product);
  });
  return [...unique.values()];
}

async function getConfig() {
  const response = await fetch(CONFIG_ENDPOINT, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function saveConfig(update) {
  const response = await fetch(CONFIG_ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
    keepalive: true
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const config = await response.json();
  publishConfigUpdate(config);
  return config;
}

function getConfigChannel() {
  if (typeof BroadcastChannel !== "function") return null;
  if (!configChannel) configChannel = new BroadcastChannel(CONFIG_CHANNEL_NAME);
  return configChannel;
}

function publishConfigUpdate(config) {
  const payload = { config, publishedAt: Date.now() };
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // BroadcastChannel and polling remain available when storage is blocked.
  }
  getConfigChannel()?.postMessage(config);
}

async function saveSelectedCar(selectedCar) {
  return saveConfig({ selectedCar });
}

function createCarOption(car) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ta-car-option";
  button.dataset.carId = car.id;
  button.style.setProperty("--team-color", car.accent);
  button.setAttribute("aria-pressed", "false");
  button.setAttribute("aria-label", `Usar el carro de ${car.team} en el dashboard`);

  const imageArea = document.createElement("span");
  imageArea.className = "ta-car-option__image";

  const image = document.createElement("img");
  image.src = car.image;
  image.alt = `Carro de ${car.team}`;
  image.loading = "lazy";
  image.decoding = "async";
  imageArea.append(image);

  const text = document.createElement("span");
  text.className = "ta-car-option__text";

  const name = document.createElement("strong");
  name.textContent = car.team;

  const detail = document.createElement("span");
  detail.textContent = car.detail || "Monoplaza 2026";
  text.append(name, detail);

  const check = document.createElement("span");
  check.className = "ta-car-option__check";
  check.setAttribute("aria-hidden", "true");
  check.textContent = "✓";

  button.append(imageArea, text, check);
  return button;
}

function renderAdminSelection(section, selectedCarId, statusMessage = "") {
  const selectedCar = findCar(selectedCarId);
  section.querySelectorAll(".ta-car-option").forEach((button) => {
    const isSelected = button.dataset.carId === selectedCar.id;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });

  const current = section.querySelector("[data-ta-current-car]");
  if (current) current.textContent = `${selectedCar.team} activo`;

  const status = section.querySelector("[data-ta-car-status]");
  if (status) status.textContent = statusMessage;
}

function setOptionsBusy(section, busy) {
  section.querySelectorAll(".ta-car-option").forEach((button) => {
    button.disabled = busy;
  });
}

function buildAdminSelector(selectedCarId) {
  const section = document.createElement("section");
  section.className = "panel mb-6 ta-car-config";
  section.dataset.taCarSelector = "true";
  section.setAttribute("aria-labelledby", "ta-car-selector-title");

  const header = document.createElement("div");
  header.className = "ta-car-config__header";

  const headingGroup = document.createElement("div");
  const heading = document.createElement("p");
  heading.id = "ta-car-selector-title";
  heading.className = "tag";
  heading.textContent = "Carro del dashboard";

  const description = document.createElement("p");
  description.className = "ta-car-config__description";
  description.textContent =
    "Escoge una escudería. La selección se refleja automáticamente en el dashboard.";
  headingGroup.append(heading, description);

  const current = document.createElement("span");
  current.className = "ta-car-config__current";
  current.dataset.taCurrentCar = "true";
  header.append(headingGroup, current);

  const grid = document.createElement("div");
  grid.className = "ta-car-grid";
  grid.setAttribute("aria-label", "Carros disponibles");
  CARS.forEach((car) => grid.append(createCarOption(car)));

  const status = document.createElement("p");
  status.className = "ta-car-config__status";
  status.dataset.taCarStatus = "true";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  section.append(header, grid, status);
  renderAdminSelection(section, selectedCarId);

  grid.addEventListener("click", async (event) => {
    const button = event.target.closest(".ta-car-option");
    if (!button || button.disabled) return;

    const car = findCar(button.dataset.carId);
    setOptionsBusy(section, true);
    renderAdminSelection(section, car.id, `Guardando ${car.team}…`);
    const current = section.querySelector("[data-ta-current-car]");
    if (current) current.textContent = `Guardando ${car.team}…`;

    try {
      const config = await saveSelectedCar(car.id);
      if (config.selectedCar !== car.id) {
        throw new Error("La configuración no conservó la selección");
      }
      section.dataset.savedCar = car.id;
      renderAdminSelection(section, car.id, `${car.team} ya está visible en el dashboard.`);
    } catch (error) {
      renderAdminSelection(
        section,
        section.dataset.savedCar || DEFAULT_CAR_ID,
        "No se pudo guardar. Intenta de nuevo."
      );
      console.error("No se pudo guardar el carro del dashboard", error);
    } finally {
      setOptionsBusy(section, false);
    }
  });

  section.dataset.savedCar = findCar(selectedCarId).id;
  return section;
}

function createSavedAdRow(product) {
  const row = document.createElement("div");
  row.className = "ta-saved-ad";

  const imageArea = document.createElement("span");
  imageArea.className = "ta-saved-ad__image";
  const image = document.createElement("img");
  image.src = product.image;
  image.alt = product.name;
  image.loading = "lazy";
  image.decoding = "async";
  imageArea.append(image);

  const text = document.createElement("span");
  text.className = "ta-saved-ad__text";
  const name = document.createElement("strong");
  name.textContent = product.name;
  const brand = document.createElement("span");
  brand.textContent = product.brand;
  const productLink = document.createElement("a");
  productLink.href = product.url;
  productLink.target = "_blank";
  productLink.rel = "noopener noreferrer";
  productLink.textContent = "Ver producto ↗";
  text.append(name, brand, productLink);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "ta-saved-ad__remove";
  remove.dataset.taRemoveAd = "true";
  remove.dataset.productId = product.id;
  remove.dataset.productSource = product.source;
  remove.setAttribute("aria-label", `Quitar ${product.name} de los anuncios`);
  remove.title = "Quitar anuncio";
  remove.textContent = "×";

  row.append(imageArea, text, remove);
  return row;
}

function getAdminAdState(section) {
  return {
    selectedAds: normalizeProductIds(JSON.parse(section.dataset.savedAds || "[]")),
    customAds: normalizeCustomAds(JSON.parse(section.dataset.savedCustomAds || "[]")),
    adsEnabled: section.dataset.savedAdsEnabled === "true"
  };
}

function saveAdminAdState(section, config) {
  section.dataset.savedAds = JSON.stringify(normalizeProductIds(config.selectedAds));
  section.dataset.savedCustomAds = JSON.stringify(normalizeCustomAds(config.customAds));
  section.dataset.savedAdsEnabled = String(config.adsEnabled !== false);
}

function renderAdAdminSelection(section, statusMessage = "") {
  const state = getAdminAdState(section);
  const products = getConfiguredProducts(state);
  const toggle = section.querySelector("[data-ta-ads-enabled]");
  if (toggle) toggle.checked = state.adsEnabled;

  const list = section.querySelector("[data-ta-ad-list]");
  if (list) {
    list.replaceChildren();
    if (products.length === 0) {
      const empty = document.createElement("p");
      empty.className = "ta-saved-ad-list__empty";
      empty.textContent = "No hay productos en la rotación.";
      list.append(empty);
    } else {
      products.forEach((product) => list.append(createSavedAdRow(product)));
    }
  }

  const count = section.querySelector("[data-ta-ad-count]");
  if (count) {
    count.textContent = state.adsEnabled
      ? `${products.length} ${products.length === 1 ? "producto activo" : "productos en rotación"}`
      : "Anuncios pausados";
  }

  const status = section.querySelector("[data-ta-ad-status]");
  if (status) status.textContent = statusMessage;
}

function setAdOptionsBusy(section, busy) {
  section
    .querySelectorAll("button, input, [data-ta-ads-enabled]")
    .forEach((control) => (control.disabled = busy));
}

function buildAdminAdSelector(config) {
  const selectedIds = normalizeProductIds(config.selectedAds);
  const customAds = normalizeCustomAds(config.customAds);
  const adsEnabled = config.adsEnabled !== false;
  const section = document.createElement("section");
  section.className = "panel mb-6 ta-ad-config";
  section.dataset.taAdSelector = "true";
  section.dataset.savedAds = JSON.stringify(selectedIds);
  section.dataset.savedCustomAds = JSON.stringify(customAds);
  section.dataset.savedAdsEnabled = String(adsEnabled);
  section.setAttribute("aria-labelledby", "ta-ad-selector-title");

  const header = document.createElement("div");
  header.className = "ta-ad-config__header";

  const headingGroup = document.createElement("div");
  const heading = document.createElement("p");
  heading.id = "ta-ad-selector-title";
  heading.className = "tag";
  heading.textContent = "Anuncios de Coauto Simracing";
  const description = document.createElement("p");
  description.className = "ta-ad-config__description";
  description.textContent = "Promociona cualquier producto de Coauto Simracing usando su enlace.";
  headingGroup.append(heading, description);

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "ta-ad-toggle";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = adsEnabled;
  toggle.dataset.taAdsEnabled = "true";
  const toggleTrack = document.createElement("span");
  toggleTrack.className = "ta-ad-toggle__track";
  toggleTrack.setAttribute("aria-hidden", "true");
  const toggleText = document.createElement("span");
  toggleText.textContent = "Anuncios activos";
  toggleLabel.append(toggle, toggleTrack, toggleText);
  header.append(headingGroup, toggleLabel);

  const linkTools = document.createElement("div");
  linkTools.className = "ta-ad-link-tools";
  const form = document.createElement("form");
  form.className = "ta-ad-link-form";
  const linkLabel = document.createElement("label");
  linkLabel.className = "field";
  linkLabel.htmlFor = "ta-coauto-product-url";
  linkLabel.textContent = "Enlace del producto";
  const linkControls = document.createElement("div");
  linkControls.className = "ta-ad-link-controls";
  const linkInput = document.createElement("input");
  linkInput.id = "ta-coauto-product-url";
  linkInput.className = "input ta-ad-link-input";
  linkInput.type = "url";
  linkInput.inputMode = "url";
  linkInput.placeholder = "https://www.coautosim.com/products/...";
  linkInput.autocomplete = "off";
  linkInput.required = true;
  const addButton = document.createElement("button");
  addButton.type = "submit";
  addButton.className = "btn-primary ta-ad-link-submit";
  addButton.textContent = "Agregar";
  linkControls.append(linkInput, addButton);
  form.append(linkLabel, linkControls);

  const catalogLink = document.createElement("a");
  catalogLink.className = "btn-ghost ta-ad-catalog-link";
  catalogLink.href = "https://www.coautosim.com";
  catalogLink.target = "_blank";
  catalogLink.rel = "noopener noreferrer";
  catalogLink.textContent = "Abrir catálogo ↗";
  linkTools.append(form, catalogLink);

  const activeLabel = document.createElement("p");
  activeLabel.className = "tag ta-ad-active-label";
  activeLabel.textContent = "Productos en rotación";
  const list = document.createElement("div");
  list.className = "ta-saved-ad-list";
  list.dataset.taAdList = "true";
  list.setAttribute("aria-label", "Productos en la rotación de anuncios");

  const footer = document.createElement("div");
  footer.className = "ta-ad-config__footer";
  const count = document.createElement("span");
  count.dataset.taAdCount = "true";
  const status = document.createElement("span");
  status.dataset.taAdStatus = "true";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  footer.append(count, status);

  section.append(header, linkTools, activeLabel, list, footer);
  renderAdAdminSelection(section);

  toggle.addEventListener("change", async () => {
    const previous = section.dataset.savedAdsEnabled === "true";
    setAdOptionsBusy(section, true);
    section.dataset.savedAdsEnabled = String(toggle.checked);
    renderAdAdminSelection(
      section,
      toggle.checked ? "Activando anuncios…" : "Pausando anuncios…"
    );
    try {
      const saved = await saveConfig({ adsEnabled: toggle.checked });
      saveAdminAdState(section, saved);
      renderAdAdminSelection(
        section,
        saved.adsEnabled !== false
          ? "Los anuncios ya están activos en el dashboard."
          : "Los anuncios quedaron pausados."
      );
    } catch (error) {
      section.dataset.savedAdsEnabled = String(previous);
      renderAdAdminSelection(section, "No se pudo cambiar el estado de los anuncios.");
      console.error("No se pudo guardar el estado de anuncios", error);
    } finally {
      setAdOptionsBusy(section, false);
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = linkInput.value.trim();
    setAdOptionsBusy(section, true);
    renderAdAdminSelection(section, "Consultando producto…");
    try {
      const previewResponse = await fetch("/api/products/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const product = await previewResponse.json().catch(() => ({}));
      if (!previewResponse.ok) throw new Error(product.error || `HTTP ${previewResponse.status}`);

      const state = getAdminAdState(section);
      if (getConfiguredProducts(state).some((savedProduct) => savedProduct.url === product.url)) {
        throw new Error("Ese producto ya está en la rotación.");
      }
      const saved = await saveConfig({ customAds: [...state.customAds, product] });
      saveAdminAdState(section, saved);
      linkInput.value = "";
      renderAdAdminSelection(section, `${product.name} ya está disponible en el dashboard.`);
    } catch (error) {
      renderAdAdminSelection(section, error?.message || "No se pudo agregar el producto.");
      console.error("No se pudo agregar el anuncio por enlace", error);
    } finally {
      setAdOptionsBusy(section, false);
    }
  });

  list.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-ta-remove-ad]");
    if (!button || button.disabled) return;
    const state = getAdminAdState(section);
    const update =
      button.dataset.productSource === "custom"
        ? { customAds: state.customAds.filter((product) => product.id !== button.dataset.productId) }
        : { selectedAds: state.selectedAds.filter((id) => id !== button.dataset.productId) };
    setAdOptionsBusy(section, true);
    renderAdAdminSelection(section, "Quitando producto…");
    try {
      const saved = await saveConfig(update);
      saveAdminAdState(section, saved);
      renderAdAdminSelection(section, "La rotación del dashboard ya fue actualizada.");
    } catch (error) {
      renderAdAdminSelection(section, "No se pudo quitar el producto.");
      console.error("No se pudo quitar el anuncio", error);
    } finally {
      setAdOptionsBusy(section, false);
    }
  });

  return section;
}

function findEventConfigPanel() {
  return [...document.querySelectorAll(".panel")].find((panel) =>
    [...panel.querySelectorAll("p")].some(
      (paragraph) => paragraph.textContent.trim() === "Configuración del evento"
    )
  );
}

async function mountAdminSelector() {
  const existingCarSelector = document.querySelector("[data-ta-car-selector]");
  const existingAdSelector = document.querySelector("[data-ta-ad-selector]");
  if (adminMounting || (existingCarSelector && existingAdSelector)) return;
  const eventPanel = findEventConfigPanel();
  if (!eventPanel) return;

  adminMounting = true;
  try {
    const config = await getConfig();
    const carSelector =
      document.querySelector("[data-ta-car-selector]") ||
      buildAdminSelector(config.selectedCar || DEFAULT_CAR_ID);
    if (!carSelector.isConnected) eventPanel.insertAdjacentElement("afterend", carSelector);

    if (!document.querySelector("[data-ta-ad-selector]")) {
      carSelector.insertAdjacentElement("afterend", buildAdminAdSelector(config));
    }
  } catch (error) {
    console.error("No se pudo cargar la configuración visual de staff", error);
  } finally {
    adminMounting = false;
  }
}

function mountStaffLogout() {
  if (document.querySelector("[data-ta-staff-logout]")) return;
  const dashboardLink = document.querySelector('header a[href="/"]');
  const actionGroup = dashboardLink?.parentElement;
  if (!actionGroup) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn-ghost ta-staff-logout";
  button.dataset.taStaffLogout = "true";
  button.textContent = "Cerrar sesión";
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Cerrando…";
    try {
      await fetch("/api/staff/logout", { method: "POST" });
    } finally {
      window.location.replace("/admin");
    }
  });
  actionGroup.append(button);
}

function mountAdminEnhancements() {
  mountAdminSelector();
  mountStaffLogout();
}

async function verifyStaffSession() {
  try {
    const response = await fetch("/api/staff/session", { cache: "no-store" });
    const session = response.ok ? await response.json() : { authenticated: false };
    if (!session.authenticated) window.location.replace("/admin");
  } catch {
    // A temporary network interruption should not discard an active screen.
  }
}

function updateDashboardCar(selectedCarId) {
  const target = document.querySelector(
    'img[alt="Audi Race Car"], img[data-ta-dashboard-car="true"]'
  );
  if (!target) return false;

  const car = findCar(selectedCarId);
  target.src = car.image;
  target.alt = `Carro de ${car.team}`;
  target.dataset.taDashboardCar = "true";
  target.dataset.carId = car.id;
  target.classList.add("ta-dashboard-car");
  target.style.setProperty("--team-color", car.accent);

  const container = target.parentElement;
  if (container) {
    container.classList.add("ta-dashboard-car-row");
    const label = target.previousElementSibling;
    if (label?.tagName === "P") {
      label.textContent = `${car.team} · ${car.detail || "Monoplaza 2026"}`;
    }
  }
  return true;
}

function applyDashboardConfig(config) {
  if (!config || typeof config !== "object") return;
  updateDashboardCar(config.selectedCar || DEFAULT_CAR_ID);
  updateDashboardAds(config);
}

function findDashboardAdPanel() {
  const enhancedPanel = document.querySelector("[data-ta-product-ad-panel]");
  if (enhancedPanel) return enhancedPanel;

  const storeLink = [...document.querySelectorAll("a")].find((link) => {
    try {
      return (
        new URL(link.href).hostname === "www.coautosim.com" &&
        link.textContent.toLowerCase().includes("adquiere")
      );
    } catch {
      return false;
    }
  });
  return storeLink?.closest(".panel") || null;
}

function renderDashboardAd(panel, product) {
  const link = document.createElement("a");
  link.className = "ta-product-ad";
  link.href = product.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", `Comprar ${product.name} en Coauto Simracing`);

  const media = document.createElement("span");
  media.className = "ta-product-ad__media";
  const image = document.createElement("img");
  image.src = product.image;
  image.alt = product.name;
  image.decoding = "async";
  media.append(image);

  const content = document.createElement("span");
  content.className = "ta-product-ad__content";
  const eyebrow = document.createElement("span");
  eyebrow.className = "ta-product-ad__eyebrow";
  eyebrow.textContent = "Producto destacado · Coauto Simracing";
  const name = document.createElement("strong");
  name.textContent = product.name;
  const brand = document.createElement("span");
  brand.className = "ta-product-ad__brand";
  brand.textContent = product.brand;
  const action = document.createElement("span");
  action.className = "ta-product-ad__action";
  action.textContent = "Comprar ↗";
  content.append(eyebrow, name, brand, action);

  const rotation = document.createElement("span");
  rotation.className = "ta-product-ad__rotation";
  rotation.textContent = `${dashboardProductIndex + 1} / ${dashboardProducts.length}`;
  rotation.setAttribute("aria-hidden", "true");

  link.append(media, content, rotation);
  panel.hidden = false;
  panel.style.removeProperty("display");
  panel.classList.add("ta-product-ad-panel");
  panel.dataset.taProductAdPanel = "true";
  panel.dataset.productId = product.id;
  panel.replaceChildren(link);
}

function updateDashboardAds(config) {
  const products = getConfiguredProducts(config);
  const signature = `${config.adsEnabled !== false}:${products
    .map((product) => `${product.id}:${product.url}:${product.image}`)
    .join("|")}`;
  if (signature !== dashboardAdSignature) {
    dashboardAdSignature = signature;
    dashboardProducts = products;
    dashboardProductIndex = 0;
  }

  const panel = findDashboardAdPanel();
  if (!panel) return;

  if (config.adsEnabled === false || dashboardProducts.length === 0) {
    panel.hidden = true;
    panel.style.display = "none";
    panel.dataset.taProductAdPanel = "true";
    panel.dataset.productId = "";
    return;
  }

  const currentProduct = dashboardProducts[dashboardProductIndex] || dashboardProducts[0];
  if (panel.dataset.productId !== currentProduct.id) renderDashboardAd(panel, currentProduct);
}

function rotateDashboardAd() {
  if (dashboardProducts.length <= 1) return;
  const panel = findDashboardAdPanel();
  if (!panel || panel.hidden) return;
  dashboardProductIndex = (dashboardProductIndex + 1) % dashboardProducts.length;
  renderDashboardAd(panel, dashboardProducts[dashboardProductIndex]);
}

async function syncDashboardCar() {
  if (dashboardSyncing) return;
  dashboardSyncing = true;
  try {
    const config = await getConfig();
    applyDashboardConfig(config);
  } catch (error) {
    console.error("No se pudo actualizar el carro del dashboard", error);
  } finally {
    dashboardSyncing = false;
  }
}

function listenForDashboardConfigUpdates() {
  getConfigChannel()?.addEventListener("message", (event) => {
    applyDashboardConfig(event.data);
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== CONFIG_STORAGE_KEY || !event.newValue) return;
    try {
      applyDashboardConfig(JSON.parse(event.newValue).config);
    } catch {
      // Polling will recover from malformed or unavailable storage data.
    }
  });
}

function observePage(mount) {
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      mount();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  mount();
  return observer;
}

function enhanceRegistrationNavigation() {
  document.querySelectorAll('a[href="/"]').forEach((link) => {
    if (!link.textContent.toLowerCase().includes("dashboard")) return;
    link.classList.add("ta-registration-back");
    link.textContent = "← Volver al dashboard";
    link.setAttribute("aria-label", "Volver al dashboard del evento");
  });
}

function enforceSiteTitle() {
  if (document.title !== SITE_TITLE) document.title = SITE_TITLE;
}

const titleObserver = new MutationObserver(enforceSiteTitle);
titleObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
enforceSiteTitle();

if (window.location.pathname.startsWith("/admin")) {
  observePage(mountAdminEnhancements);
  window.setInterval(verifyStaffSession, 60000);
} else if (window.location.pathname === "/") {
  listenForDashboardConfigUpdates();
  observePage(syncDashboardCar);
  window.setInterval(syncDashboardCar, DASHBOARD_SYNC_MS);
  window.setInterval(rotateDashboardAd, AD_ROTATION_MS);
} else if (window.location.pathname.startsWith("/registro")) {
  observePage(enhanceRegistrationNavigation);
}
