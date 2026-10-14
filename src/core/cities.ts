import type { CityConfig, Place, PlaceKind, Tariff } from './types';

type Row = [id: string, name: string, district: string, lat: number, lng: number, kind: PlaceKind, weight: number, streets?: string[]];

const mk = (rows: Row[]): Place[] =>
  rows.map(([id, name, district, lat, lng, kind, weight, streets]) => ({ id, name, district, pos: { lat, lng }, kind, weight, streets }));

const EUR: Tariff = { base: 0.9, perKm: 0.5, perMin: 0.1, min: 2.5, airportFee: 1.5 };

const vilniusAirport: Place = {
  id: 'vno', name: 'Vilnius Airport (VNO)', district: 'Airport', pos: { lat: 54.6341, lng: 25.2858 }, kind: 'airport', weight: 1,
};

// Anchor points are approximate district/landmark centres. Passengers and exact addresses are always virtual.
const vilniusPlaces = mk([
  ['old-town', 'Cathedral Square', 'Old Town', 54.6857, 25.2876, 'center', 3, ['Pilies g.', 'Didžioji g.', 'Aušros Vartų g.', 'Stikliai g.']],
  ['gediminas', 'Gedimino pr.', 'Naujamiestis', 54.6896, 25.2689, 'center', 3, ['Gedimino pr.', 'Jogailos g.', 'Vilniaus g.']],
  ['station', 'Railway & Bus Station', 'Naujamiestis', 54.6702, 25.2829, 'transit', 2, ['Geležinkelio g.', 'Sodų g.']],
  ['naujamiestis', 'Vytauto g.', 'Naujamiestis', 54.6796, 25.2745, 'center', 2, ['Vytenio g.', 'Kauno g.', 'Tauro g.']],
  ['uzupis', 'Užupis', 'Užupis', 54.6806, 25.2951, 'leisure', 1.5, ['Užupio g.', 'Paupio g.']],
  ['snipiskes', 'Business District', 'Šnipiškės', 54.6998, 25.2745, 'business', 2.5, ['Konstitucijos pr.', 'Upės g.', 'Kalvarijų g.']],
  ['zverynas', 'Žvėrynas', 'Žvėrynas', 54.6988, 25.257, 'residential', 1.5, ['Birutės g.', 'Kęstučio g.', 'Vytauto g.']],
  ['antakalnis', 'Antakalnis', 'Antakalnis', 54.7035, 25.3198, 'residential', 1.5, ['Antakalnio g.', 'Subačiaus g.']],
  ['zirmunai', 'Žirmūnai', 'Žirmūnai', 54.715, 25.297, 'residential', 2, ['Žirmūnų g.', 'Žalgirio g.']],
  ['seskine', 'Šeškinė', 'Šeškinė', 54.7285, 25.2573, 'residential', 1.8, ['Šeškinės g.', 'Taikos g.']],
  ['virsuliskes', 'Viršuliškės', 'Viršuliškės', 54.723, 25.241, 'residential', 1.5, ['Viršuliškių g.', 'Laisvės pr.']],
  ['justiniskes', 'Justiniškės', 'Justiniškės', 54.726, 25.222, 'residential', 1.5, ['Justiniškių g.', 'Gerosios Vilties g.']],
  ['fabijoniskes', 'Fabijoniškės', 'Fabijoniškės', 54.7388, 25.2335, 'residential', 1.3, ['Fabijoniškių g.', 'Gedvydžių g.']],
  ['pasilaiciai', 'Pašilaičiai', 'Pašilaičiai', 54.7378, 25.2024, 'residential', 1.2, ['Pašilaičių g.', 'Tuskulėnų g.']],
  ['karoliniskes', 'Karoliniškės', 'Karoliniškės', 54.699, 25.216, 'residential', 1.3, ['Karoliniškių g.', 'Architektų g.']],
  ['lazdynai', 'Lazdynai', 'Lazdynai', 54.687, 25.2155, 'residential', 1.5, ['Lazdynų g.', 'Erfurto g.']],
  ['pilaite', 'Pilaitė', 'Pilaitė', 54.709, 25.17, 'residential', 1.2, ['Pilaitės pr.', 'Karaliaus Mindaugo pr.']],
  ['vilkpede', 'Vilkpėdė', 'Vilkpėdė', 54.654, 25.254, 'residential', 1, ['Vilkpėdės g.', 'Naugarduko g.']],
  ['rasos', 'Rasos', 'Rasos', 54.6642, 25.3003, 'residential', 1.1, ['Rasų g.', 'Maironio g.']],
  ['panorama', 'Konstitucijos pr. malls', 'Šnipiškės', 54.7117, 25.2833, 'leisure', 1.8, ['Saltoniškių g.', 'Konstitucijos pr.']],
]);

const generic = (id: string, name: string, country: string, lat: number, lng: number, currency: 'EUR' | 'PLN', tariff: Tariff, air: [number, number, string]): CityConfig => {
  const center = { lat, lng };
  const kmLat = 1 / 111;
  const kmLng = 1 / (111 * Math.cos((lat * Math.PI) / 180));
  const dirs: [string, number, number, PlaceKind][] = [
    ['Centre', 0, 0, 'center'], ['North', 3.5, 0, 'residential'], ['South', -3.5, 0, 'residential'],
    ['East', 0, 3.5, 'residential'], ['West', 0, -3.5, 'residential'],
  ];
  const places = dirs.map(([n, dn, de, kind], i): Place => ({
    id: `${id}-${i}`, name: n === 'Centre' ? `${name} centre` : `${name} ${n}`, district: n === 'Centre' ? name : `${name} ${n}`,
    pos: { lat: lat + dn * kmLat, lng: lng + de * kmLng }, kind, weight: kind === 'center' ? 3 : 1.4,
  }));
  const airport: Place = { id: `${id}-air`, name: air[2], district: 'Airport', pos: { lat: air[0], lng: air[1] }, kind: 'airport', weight: 1 };
  return { id, name, country, center, currency, tariff, places, airport, beta: true };
};

export const CITIES: CityConfig[] = [
  { id: 'vilnius', name: 'Vilnius', country: 'Lithuania', center: { lat: 54.6872, lng: 25.2797 }, currency: 'EUR', tariff: EUR, places: vilniusPlaces, airport: vilniusAirport },
  generic('kaunas', 'Kaunas', 'Lithuania', 54.8985, 23.9036, 'EUR', EUR, [54.9639, 24.0848, 'Kaunas Airport (KUN)']),
  generic('klaipeda', 'Klaipėda', 'Lithuania', 55.7033, 21.1443, 'EUR', EUR, [55.9732, 21.0939, 'Palanga Airport (PLQ)']),
  generic('riga', 'Riga', 'Latvia', 56.9496, 24.1052, 'EUR', { ...EUR, perKm: 0.55 }, [56.9236, 23.9711, 'Riga Airport (RIX)']),
  generic('warsaw', 'Warsaw', 'Poland', 52.2297, 21.0122, 'PLN', { base: 4, perKm: 2, perMin: 0.5, min: 12, airportFee: 6 }, [52.1657, 20.9671, 'Warsaw Chopin (WAW)']),
];

export const getCity = (id: string): CityConfig => CITIES.find((c) => c.id === id) ?? CITIES[0];
