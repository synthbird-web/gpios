/* GPIOS — translations (English is the default language) */
const I18N = {
  en: {
    'app.tagline': 'Geo-referenced bird records and field sessions',
    'tab.new': 'New session',
    'tab.edit': '✏️ Edit session',
    'tab.list': 'My sessions',
    'settings.open': 'Settings',

    'edit.tag': '✏️ EDITING SESSION',
    'edit.cancel': '✕ Cancel',
    'edit.cancelTitle': 'Discard changes and go back',

    'form.title': 'Session title',
    'form.titlePh': 'e.g. Morning watch at the lagoon',
    'form.date': 'Date',
    'form.time': 'Time',
    'form.location': 'Location',
    'form.locationPh': 'Search a place, street or postcode, or click the map…',
    'form.locationHint': 'Search an address or click on the map to set the exact spot.',
    'form.weather': 'Weather conditions',
    'form.addBird': 'Add bird',
    'form.birdPh': 'Type a name in English, Spanish or scientific…',
    'form.count': 'Count',
    'form.notes': 'Observation notes',
    'form.notesPh': 'e.g. Injured adult',
    'form.addBirdBtn': '+ Add bird to the list',
    'form.noNotes': 'No notes',
    'form.coordsHint': 'Click the map or search above to set the location.',
    'form.coordsSet': 'Coordinates set: {lat}, {lng}',
    'form.save': 'Save session',
    'form.saveChanges': 'Save changes',
    'form.pinLabel': 'Location: {lat}, {lng}',

    'weather.sunny': 'Sunny',
    'weather.cloudy': 'Cloudy',
    'weather.fog': 'Fog',
    'weather.rain': 'Rain',
    'weather.wind': 'Wind',
    'weather.haze': 'Haze',
    'weather.storm': 'Storm',
    'weather.hail': 'Hail',
    'weather.snow': 'Snow',
    'weather.none': 'Not recorded',

    'list.empty': 'No field sessions recorded yet.',
    'list.badge': '{species} species ({individuals} individuals)',

    'detail.back': '← Back',
    'detail.edit': '✏️ Edit',
    'detail.editTitle': 'Edit details and observations',
    'detail.delete': 'Delete',
    'detail.weather': 'Weather conditions:',
    'detail.birds': 'Birds observed ({n}):',
    'detail.count': 'Individuals:',

    'data.export': 'Export data:',
    'data.or': 'or',
    'data.import': 'Import JSON backup',

    'map.label': 'Map:',
    'map.osm': 'Street map (OSM)',
    'map.satellite': 'Satellite (Esri)',
    'map.myArea': 'My area',
    'map.myAreaTitle': 'Back to my region',

    'offline.title': 'No internet connection',
    'offline.body': 'Map tiles and place search need internet. Your sessions are saved locally and remain available.',
    'offline.noMap': 'The map library could not be loaded. Connect to the internet and restart GPIOS to see the map.',

    'msg.saveError': 'Error saving the session: {err}',
    'msg.connError': 'Connection error. Please try again.',
    'msg.loadError': 'The requested session could not be loaded.',
    'msg.deleteConfirm': 'Are you sure you want to delete this session from your notebook?',
    'msg.deleteError': 'Error deleting the session.',
    'msg.invalidJson': 'The selected file is not valid JSON.',
    'msg.imported': '✓ {n} sessions imported successfully.',
    'msg.importedSkipped': '✓ {n} sessions imported ({s} skipped: missing coordinates).',
    'msg.importError': 'Error importing the JSON file: {err}',
    'msg.saved': '✓ Session saved',
    'msg.settingsSaved': '✓ Settings saved',

    'ob.welcomeTitle': 'Welcome to GPIOS',
    'ob.welcomeText': 'Your field notebook for birds, anywhere in the world. Let’s set up a few things first — you can change them later with the ⚙️ button.',
    'ob.settingsTitle': 'Settings',
    'ob.settingsText': 'Update your profile, language and home area.',
    'ob.name': 'Your name',
    'ob.namePh': 'e.g. Alex',
    'ob.language': 'Language',
    'ob.location': 'Home area',
    'ob.locationHelp': 'Used to centre the map on your province or region when the app starts.',
    'ob.detect': '📍 Detect my location',
    'ob.detecting': 'Detecting location…',
    'ob.manualPh': 'Or type your city, region or country…',
    'ob.current': 'Selected: {label}',
    'ob.none': 'No location selected yet.',
    'ob.viaGps': 'via GPS',
    'ob.viaIp': 'via IP address',
    'ob.viaManual': 'entered manually',
    'ob.vpnWarning': '⚠️ Your IP places you in {place}, but your computer clock is set to the {tz} time zone. You may be using a VPN or proxy. Please type your location manually if this is wrong.',
    'ob.useAnyway': 'Use it anyway',
    'ob.detectFailed': 'Your location could not be detected automatically. Please type it manually.',
    'ob.start': 'Start',
    'ob.save': 'Save',
    'ob.cancel': 'Cancel',
    'ob.required': 'Please enter your name and choose a location.',
    'ob.internetNote': '🌐 Maps and place search require an internet connection.',

    'greeting': 'Hi, {name}'
  },

  es: {
    'app.tagline': 'Registro ornitológico georreferenciado y jornadas de campo',
    'tab.new': 'Nueva jornada',
    'tab.edit': '✏️ Editar jornada',
    'tab.list': 'Mis jornadas',
    'settings.open': 'Ajustes',

    'edit.tag': '✏️ EDITANDO JORNADA',
    'edit.cancel': '✕ Cancelar',
    'edit.cancelTitle': 'Descartar los cambios y volver',

    'form.title': 'Título de la jornada',
    'form.titlePh': 'Ej.: Observación matutina en la laguna',
    'form.date': 'Fecha',
    'form.time': 'Hora',
    'form.location': 'Ubicación',
    'form.locationPh': 'Busca un paraje, calle o código postal, o haz clic en el mapa…',
    'form.locationHint': 'Busca una dirección o haz clic en el mapa para fijar el punto exacto.',
    'form.weather': 'Condiciones meteorológicas',
    'form.addBird': 'Añadir ave',
    'form.birdPh': 'Escribe el nombre en español, inglés o científico…',
    'form.count': 'Cant.',
    'form.notes': 'Notas de observación',
    'form.notesPh': 'Ej.: Adulto herido',
    'form.addBirdBtn': '+ Añadir ave a la lista',
    'form.noNotes': 'Sin notas',
    'form.coordsHint': 'Haz clic en el mapa o busca arriba para fijar la ubicación.',
    'form.coordsSet': 'Coordenadas fijadas: {lat}, {lng}',
    'form.save': 'Guardar jornada',
    'form.saveChanges': 'Guardar cambios',
    'form.pinLabel': 'Ubicación: {lat}, {lng}',

    'weather.sunny': 'Soleado',
    'weather.cloudy': 'Nublado',
    'weather.fog': 'Niebla',
    'weather.rain': 'Lluvia',
    'weather.wind': 'Viento',
    'weather.haze': 'Calima',
    'weather.storm': 'Tormenta',
    'weather.hail': 'Granizo',
    'weather.snow': 'Nieve',
    'weather.none': 'No registradas',

    'list.empty': 'Todavía no hay jornadas registradas.',
    'list.badge': '{species} especies ({individuals} ejemplares)',

    'detail.back': '← Volver',
    'detail.edit': '✏️ Editar',
    'detail.editTitle': 'Editar datos y observaciones',
    'detail.delete': 'Eliminar',
    'detail.weather': 'Condiciones meteorológicas:',
    'detail.birds': 'Aves observadas ({n}):',
    'detail.count': 'Ejemplares:',

    'data.export': 'Exportar datos:',
    'data.or': 'o',
    'data.import': 'Importar copia de seguridad JSON',

    'map.label': 'Mapa:',
    'map.osm': 'Callejero (OSM)',
    'map.satellite': 'Satélite (Esri)',
    'map.myArea': 'Mi zona',
    'map.myAreaTitle': 'Volver a mi región',

    'offline.title': 'Sin conexión a internet',
    'offline.body': 'Las teselas del mapa y la búsqueda de lugares necesitan internet. Tus jornadas se guardan en local y siguen disponibles.',
    'offline.noMap': 'No se ha podido cargar la librería de mapas. Conéctate a internet y reinicia GPIOS para ver el mapa.',

    'msg.saveError': 'Error al guardar la jornada: {err}',
    'msg.connError': 'Error de conexión. Inténtalo de nuevo.',
    'msg.loadError': 'No se ha podido cargar la jornada solicitada.',
    'msg.deleteConfirm': '¿Seguro que quieres eliminar esta jornada del cuaderno?',
    'msg.deleteError': 'Error al eliminar la jornada.',
    'msg.invalidJson': 'El archivo seleccionado no es un JSON válido.',
    'msg.imported': '✓ Se han importado {n} jornadas correctamente.',
    'msg.importedSkipped': '✓ Se han importado {n} jornadas ({s} omitidas por no tener coordenadas).',
    'msg.importError': 'Error al importar el archivo JSON: {err}',
    'msg.saved': '✓ Jornada guardada',
    'msg.settingsSaved': '✓ Ajustes guardados',

    'ob.welcomeTitle': 'Bienvenido a GPIOS',
    'ob.welcomeText': 'Tu cuaderno de campo de aves, en cualquier parte del mundo. Antes de empezar, configura unos datos básicos; podrás cambiarlos cuando quieras con el botón ⚙️.',
    'ob.settingsTitle': 'Ajustes',
    'ob.settingsText': 'Actualiza tu perfil, el idioma y tu zona habitual.',
    'ob.name': 'Tu nombre',
    'ob.namePh': 'Ej.: Lucía',
    'ob.language': 'Idioma',
    'ob.location': 'Zona habitual',
    'ob.locationHelp': 'Se usa para centrar el mapa en tu provincia o región al abrir la aplicación.',
    'ob.detect': '📍 Detectar mi ubicación',
    'ob.detecting': 'Detectando ubicación…',
    'ob.manualPh': 'O escribe tu ciudad, provincia o país…',
    'ob.current': 'Seleccionada: {label}',
    'ob.none': 'Aún no has elegido ninguna ubicación.',
    'ob.viaGps': 'por GPS',
    'ob.viaIp': 'por dirección IP',
    'ob.viaManual': 'introducida manualmente',
    'ob.vpnWarning': '⚠️ Tu IP te sitúa en {place}, pero el reloj de tu equipo está en la zona horaria {tz}. Es posible que uses una VPN o un proxy. Si no es correcto, escribe tu ubicación manualmente.',
    'ob.useAnyway': 'Usarla de todos modos',
    'ob.detectFailed': 'No se ha podido detectar tu ubicación automáticamente. Escríbela manualmente.',
    'ob.start': 'Empezar',
    'ob.save': 'Guardar',
    'ob.cancel': 'Cancelar',
    'ob.required': 'Introduce tu nombre y elige una ubicación.',
    'ob.internetNote': '🌐 Los mapas y la búsqueda de lugares requieren conexión a internet.',

    'greeting': 'Hola, {name}'
  }
};

const WEATHER_CODES = ['sunny', 'cloudy', 'fog', 'rain', 'wind', 'haze', 'storm', 'hail', 'snow'];

// Values stored by earlier versions (Spanish free text)
const LEGACY_WEATHER = {
  Soleado: 'sunny', Nublado: 'cloudy', Lluvia: 'rain', Viento: 'wind',
  Calima: 'haze', Tormenta: 'storm', Granizo: 'hail'
};

let currentLang = 'en';

function detectSystemLang() {
  return (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
}

function t(key, vars = {}) {
  const str = (I18N[currentLang] && I18N[currentLang][key]) ?? I18N.en[key] ?? key;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
}

function weatherLabel(value) {
  if (!value) return t('weather.none');
  const code = LEGACY_WEATHER[value] || value;
  return WEATHER_CODES.includes(code) ? t(`weather.${code}`) : value;
}

function speciesName(sp) {
  if (!sp) return '';
  return currentLang === 'es'
    ? (sp.common_name_es || sp.common_name_en || sp.scientific_name)
    : (sp.common_name_en || sp.common_name_es || sp.scientific_name);
}

function speciesAltName(sp) {
  if (!sp) return '';
  return currentLang === 'es' ? (sp.common_name_en || '') : (sp.common_name_es || '');
}

function applyI18n(root = document) {
  document.documentElement.lang = currentLang;
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
}

function setLanguage(lang) {
  currentLang = I18N[lang] ? lang : 'en';
  applyI18n();
}
