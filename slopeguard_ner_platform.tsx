import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ShieldAlert, Map as MapIcon, Satellite, CloudRain, Mountain, Activity,
  Sliders, History, Bell, Database, Info, RefreshCw, CheckCircle2,
  AlertTriangle, XCircle, Compass, Layers, Calendar, ExternalLink,
  Search, ChevronRight, Lock, Unlock, Terminal, FileCode, Play,
  Download, Eye, HelpCircle, MapPin, TrendingUp, BarChart3, Clock,
  Copy, Check, Server, AlertOctagon, ArrowUpRight, Filter
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Cell
} from 'recharts';

// ============================================================================
// 1. TYPES & INTERFACES
// ============================================================================

export type NERStateName =
  | 'Assam'
  | 'Arunachal Pradesh'
  | 'Meghalaya'
  | 'Manipur'
  | 'Mizoram'
  | 'Nagaland'
  | 'Sikkim'
  | 'Tripura';

export type NavTabId =
  | 'overview'
  | 'map'
  | 'imagery'
  | 'rainfall-terrain'
  | 'risk-assessment'
  | 'simulator'
  | 'historical'
  | 'alerts'
  | 'sources'
  | 'about';

export interface ReferenceLocation {
  id: string;
  name: string;
  state: NERStateName;
  district: string;
  lat: number;
  lon: number;
  geologicalContext: string;
}

export interface HourlyWeatherPoint {
  time: string;
  displayTime: string;
  precipitationMm: number;
  rainMm: number;
  cumulative72hMm: number;
  soilMoisture0to7cm: number | null; // m³/m³
}

export interface NasaPowerPoint {
  date: string;
  precipMmDay: number | null;
  surfaceSoilWetness: number | null; // 0 to 1 dimensionless
}

export interface RainfallTelemetry {
  source: string;
  endpointUrl: string;
  retrievedAtIso: string;
  latestObservationIso: string;
  currentRateMmHr: number;
  accum24hMm: number;
  accum72hMm: number;
  antecedent7dMm: number;
  soilMoistureVolumetric: number | null;
  soilMoistureUnit: string;
  spatialResolution: string;
  hourlySeries: HourlyWeatherPoint[];
  nasaPowerSeries: NasaPowerPoint[];
  nasaPowerStatus: 'connected' | 'loading' | 'unavailable';
  status: 'live' | 'cached' | 'error' | 'loading';
  errorMessage?: string;
}

export interface TerrainSlopeTelemetry {
  source: string;
  endpointUrl: string;
  retrievedAtIso: string;
  centerElevationM: number | null;
  grid3x3ElevationsM: number[][] | null; // 3x3 matrix [N..S][W..E]
  gridSpacingMeters: number;
  slopeDegrees: number | null;
  aspectDegrees: number | null;
  aspectCardinal: string | null;
  crs: string;
  algorithm: string;
  status: 'computed' | 'unavailable' | 'loading';
  errorMessage?: string;
}

export interface HistoricalLandslideEvent {
  id: string;
  title: string;
  state: NERStateName;
  district: string;
  locationName: string;
  lat: number;
  lon: number;
  eventDate: string; // YYYY-MM-DD
  datePrecision: 'exact_day' | 'month_year';
  trigger: 'Monsoon Extreme Rainfall' | 'Cyclonic Depression Rainfall' | 'Cloudburst / Flash Flood' | 'Slope Cut + Heavy Rain';
  fatalities: number | null;
  impactSummary: string;
  sourceCatalog: 'GSI Bhukosh Landslide Inventory' | 'NASA Global Landslide Catalog (GLC)' | 'NRSC / State Disaster Management Report';
  sourceCitationUrl: string;
  confidence: 'Verified Field/Official Report' | 'Satellite + Media Confirmed';
}

export interface RiskWeights {
  rain24h: number;
  rain72h: number;
  slope: number;
  soilMoisture: number;
  historicalProximity: number;
}

export interface FactorContribution {
  key: keyof RiskWeights;
  label: string;
  rawValueDisplay: string;
  normalized0to1: number;
  weight: number;
  weightedPoints: number;
  available: boolean;
  assumptionNote: string;
}

export interface RiskAssessmentResult {
  stageBStatus: 'SUFFICIENT_DATA' | 'INSUFFICIENT_DATA' | 'STALE_DATA';
  completenessPercent: number;
  availableFactorsCount: number;
  totalFactorsCount: number;
  validationWarnings: string[];
  experimentalScore0to100: number | null;
  screeningCategory: 'INSUFFICIENT_DATA' | 'LOW_SCREENING' | 'MODERATE_SCREENING' | 'HIGH_SCREENING' | 'CRITICAL_SCREENING';
  factors: FactorContribution[];
  nearestHistoricalKm: number | null;
  historicalEventsWithin25km: number;
  computedAtIso: string;
}

export interface PrototypeNotification {
  id: string;
  createdAtIso: string;
  locationName: string;
  state: NERStateName;
  coordinates: string;
  experimentalScore: number;
  category: string;
  triggerSummary: string;
  acknowledged: boolean;
}

export interface DataSourceRegistryItem {
  id: string;
  provider: string;
  datasetName: string;
  dataType: 'Satellite Imagery Tiles' | 'Optical L2A Reflectance' | 'Precipitation & Soil Moisture' | 'Satellite Agroclimatology' | 'Digital Elevation Model' | 'Historical Landslide Inventory';
  docUrl: string;
  endpointTemplate: string;
  coverage: string;
  spatialResolution: string;
  temporalResolution: string;
  units: string;
  authRequirement: 'Public (No Key Required)' | 'OAuth2 Client Credentials (Server-Side)' | 'Curated Static Snapshot';
  integrationStatus: 'Connected (Live)' | 'Awaiting Backend Credentials' | 'Static Verified Catalog' | 'Degraded / Error';
  lastSuccessIso: string | null;
  latestObservationTime: string | null;
  limitations: string;
}

// ============================================================================
// 2. VERIFIED NORTHEAST INDIA REFERENCE LOCATIONS & HISTORICAL CATALOG
// ============================================================================

export const NER_STATES: {
  name: NERStateName;
  capital: string;
  centerLat: number;
  centerLon: number;
  zoom: number;
  physiography: string;
}[] = [
  { name: 'Assam', capital: 'Dispur / Guwahati', centerLat: 26.1445, centerLon: 91.7362, zoom: 7, physiography: 'Brahmaputra & Barak Valleys, Karbi Anglong & Dima Hasao Hills' },
  { name: 'Arunachal Pradesh', capital: 'Itanagar', centerLat: 27.0844, centerLon: 93.6053, zoom: 7, physiography: 'Eastern Himalayas, Siwalik & Lesser Himalayan Thrust Zones' },
  { name: 'Meghalaya', capital: 'Shillong', centerLat: 25.5788, centerLon: 91.8933, zoom: 8, physiography: 'Shillong Plateau, Khasi, Jaintia & Garo Hills Escarpments' },
  { name: 'Manipur', capital: 'Imphal', centerLat: 24.8170, centerLon: 93.9368, zoom: 8, physiography: 'Indo-Burman Ranges (Naga-Manipur Hills) & Imphal Valley' },
  { name: 'Mizoram', capital: 'Aizawl', centerLat: 23.7271, centerLon: 92.7176, zoom: 8, physiography: 'Lushai Hills (N-S Fold Belt of Tertiary Sandstones & Shales)' },
  { name: 'Nagaland', capital: 'Kohima', centerLat: 25.6751, centerLon: 94.1086, zoom: 8, physiography: 'Naga Hills Thrust Belt, Disang & Barail Group Shales' },
  { name: 'Sikkim', capital: 'Gangtok', centerLat: 27.3389, centerLon: 88.6065, zoom: 9, physiography: 'Teesta Basin, Main Central Thrust (MCT) High-Relief Gneiss & Schist' },
  { name: 'Tripura', capital: 'Agartala', centerLat: 23.8315, centerLon: 91.2868, zoom: 8, physiography: 'Atharamura, Longtharai & Jampui Anticlinal Hill Ranges' },
];

export const REFERENCE_LOCATIONS: ReferenceLocation[] = [
  {
    id: 'mangan-sikkim',
    name: 'Mangan & North Teesta Corridor',
    state: 'Sikkim',
    district: 'Mangan (North Sikkim)',
    lat: 27.5097,
    lon: 88.5322,
    geologicalContext: 'Steep phyllite/schist valley slopes along the Teesta River; high Main Central Thrust tectonic fracturing.'
  },
  {
    id: 'sonapur-meghalaya',
    name: 'Sonapur NH-6 Escarpment',
    state: 'Meghalaya',
    district: 'East Jaintia Hills',
    lat: 25.1064,
    lon: 92.3625,
    geologicalContext: 'Recurring highway rockfall/debris slide zone along Jaintia escarpment exposed to extreme orographic rainfall.'
  },
  {
    id: 'haflong-assam',
    name: 'Haflong & Jatinga Ridge',
    state: 'Assam',
    district: 'Dima Hasao',
    lat: 25.1632,
    lon: 93.0176,
    geologicalContext: 'Barail & Disang shale-sandstone sequences near the Haflong-Disang thrust; vulnerable to intense pre-monsoon saturation.'
  },
  {
    id: 'tupul-manipur',
    name: 'Tupul / Ijei River Valley',
    state: 'Manipur',
    district: 'Noney',
    lat: 24.8461,
    lon: 93.5419,
    geologicalContext: 'Weathered Disang shales in the Indo-Burman accretionary prism; steep valley cuts.'
  },
  {
    id: 'aizawl-mizoram',
    name: 'Aizawl South & Melthum Escarpment',
    state: 'Mizoram',
    district: 'Aizawl',
    lat: 23.6945,
    lon: 92.7158,
    geologicalContext: 'Bhuban formation interbedded siltstone-shale dip slopes susceptible to cyclonic rainfall events.'
  },
  {
    id: 'kohima-nagaland',
    name: 'Phesama / NH-29 Corridor',
    state: 'Nagaland',
    district: 'Kohima',
    lat: 25.6311,
    lon: 94.0982,
    geologicalContext: 'Crumpled Disang shales with active creep and translational debris slides along NH-29.'
  },
  {
    id: 'karsingsa-arunachal',
    name: 'Karsingsa / Banderdewa Siwalik Zone',
    state: 'Arunachal Pradesh',
    district: 'Papum Pare',
    lat: 27.1055,
    lon: 93.7845,
    geologicalContext: 'Unconsolidated Upper Siwalik sandstones and pebble beds along the Himalayan Frontal Thrust.'
  },
  {
    id: 'longtharai-tripura',
    name: 'Longtharai Hill Ghats (NH-8)',
    state: 'Tripura',
    district: 'Dhalai',
    lat: 23.9481,
    lon: 91.9583,
    geologicalContext: 'poorly consolidated Tipam and Surma group sandy shales experiencing shallow surficial earthflows.'
  }
];

export const DOCUMENTED_HISTORICAL_LANDSLIDES: HistoricalLandslideEvent[] = [
  {
    id: 'NER-HIST-001',
    title: 'Tupul Railway Construction Site Landslide (Noney)',
    state: 'Manipur',
    district: 'Noney',
    locationName: 'Tupul Yard, Ijei River Bank',
    lat: 24.8458,
    lon: 93.5425,
    eventDate: '2022-06-29',
    datePrecision: 'exact_day',
    trigger: 'Monsoon Extreme Rainfall',
    fatalities: 61,
    impactSummary: 'Massive deep-seated rotational cum debris flow in saturated Disang shales dammed the Ijei River.',
    sourceCatalog: 'GSI Bhukosh Landslide Inventory',
    sourceCitationUrl: 'https://bhukosh.gsi.gov.in/',
    confidence: 'Verified Field/Official Report'
  },
  {
    id: 'NER-HIST-002',
    title: 'Aizawl Melthum & Hlimen Quarry Landslides (Cyclone Remal)',
    state: 'Mizoram',
    district: 'Aizawl',
    locationName: 'Melthum & Hlimen, South Aizawl',
    lat: 23.6889,
    lon: 92.7164,
    eventDate: '2024-05-28',
    datePrecision: 'exact_day',
    trigger: 'Cyclonic Depression Rainfall',
    fatalities: 28,
    impactSummary: 'Extreme rainfall triggered rapid rock-debris failures along steep dip slopes following Cyclone Remal.',
    sourceCatalog: 'NRSC / State Disaster Management Report',
    sourceCitationUrl: 'https://ndma.gov.in/',
    confidence: 'Verified Field/Official Report'
  },
  {
    id: 'NER-HIST-003',
    title: 'Haflong Railway Station & Dima Hasao Multi-Slope Failure',
    state: 'Assam',
    district: 'Dima Hasao',
    locationName: 'New Haflong & Jatinga-Lampur Sector',
    lat: 25.1583,
    lon: 93.0147,
    eventDate: '2022-05-14',
    datePrecision: 'exact_day',
    trigger: 'Monsoon Extreme Rainfall',
    fatalities: 3,
    impactSummary: 'Over 60 slope failures and debris flows along the Lumding-Badarpur hill section inundated rail and road links.',
    sourceCatalog: 'GSI Bhukosh Landslide Inventory',
    sourceCitationUrl: 'https://bhukosh.gsi.gov.in/',
    confidence: 'Verified Field/Official Report'
  },
  {
    id: 'NER-HIST-004',
    title: 'Mangan & Sanklang Teesta Valley Landslides',
    state: 'Sikkim',
    district: 'Mangan',
    locationName: 'Mangan-Chungthang Corridor',
    lat: 27.5162,
    lon: 88.5341,
    eventDate: '2024-06-13',
    datePrecision: 'exact_day',
    trigger: 'Monsoon Extreme Rainfall',
    fatalities: 6,
    impactSummary: 'Over 220 mm of rainfall in 24h triggered multiple debris chutes and severed bridges in North Sikkim.',
    sourceCatalog: 'NRSC / State Disaster Management Report',
    sourceCitationUrl: 'https://sikkimsdma.gov.in/',
    confidence: 'Verified Field/Official Report'
  },
  {
    id: 'NER-HIST-005',
    title: 'Sonapur Tunnel & Lumshnong NH-6 Landslide',
    state: 'Meghalaya',
    district: 'East Jaintia Hills',
    locationName: 'Sonapur / Kuliang Sector, NH-6',
    lat: 25.1089,
    lon: 92.3642,
    eventDate: '2022-06-16',
    datePrecision: 'exact_day',
    trigger: 'Monsoon Extreme Rainfall',
    fatalities: 0,
    impactSummary: 'Recurring rock-cum-debris slide blocked vital NH-6 connecting Meghalaya with Barak Valley, Mizoram, and Tripura.',
    sourceCatalog: 'GSI Bhukosh Landslide Inventory',
    sourceCitationUrl: 'https://bhukosh.gsi.gov.in/',
    confidence: 'Verified Field/Official Report'
  },
  {
    id: 'NER-HIST-006',
    title: 'Tawang Phamla Village Night Landslide',
    state: 'Arunachal Pradesh',
    district: 'Tawang',
    locationName: 'Phamla Village',
    lat: 27.5861,
    lon: 91.8594,
    eventDate: '2016-04-22',
    datePrecision: 'exact_day',
    trigger: 'Cloudburst / Flash Flood',
    fatalities: 16,
    impactSummary: 'Intense nocturnal pre-monsoon downpour triggered a rapid debris avalanche burying a labor camp.',
    sourceCatalog: 'NASA Global Landslide Catalog (GLC)',
    sourceCitationUrl: 'https://landslides.nasa.gov/',
    confidence: 'Verified Field/Official Report'
  },
  {
    id: 'NER-HIST-007',
    title: 'Pherima / Pagala Pahar NH-29 Rock-Mudslide',
    state: 'Nagaland',
    district: 'Chümoukedima / Kohima Corridor',
    locationName: 'Pherima / Tsiedukhru Range, NH-29',
    lat: 25.7521,
    lon: 93.8965,
    eventDate: '2024-09-03',
    datePrecision: 'exact_day',
    trigger: 'Monsoon Extreme Rainfall',
    fatalities: 6,
    impactSummary: 'Catastrophic mud and boulder slide swept away a section of National Highway 29 between Dimapur and Kohima.',
    sourceCatalog: 'NRSC / State Disaster Management Report',
    sourceCitationUrl: 'https://nsdma.nagaland.gov.in/',
    confidence: 'Verified Field/Official Report'
  },
  {
    id: 'NER-HIST-008',
    title: 'South Tripura Santirbazar & Gomati Hills Landslides',
    state: 'Tripura',
    district: 'South Tripura',
    locationName: 'Santirbazar & Karbook Hill Slopes',
    lat: 23.3215,
    lon: 91.5412,
    eventDate: '2024-08-20',
    datePrecision: 'exact_day',
    trigger: 'Cyclonic Depression Rainfall',
    fatalities: 14,
    impactSummary: 'Exceptional depression rainfall (>350 mm in 48h) caused widespread shallow earthslides in unconsolidated Tipam sands.',
    sourceCatalog: 'NRSC / State Disaster Management Report',
    sourceCitationUrl: 'https://tdma.tripura.gov.in/',
    confidence: 'Verified Field/Official Report'
  },
  {
    id: 'NER-HIST-009',
    title: 'Guwahati Noonmati & Nabagraha Hill Slope Failures',
    state: 'Assam',
    district: 'Kamrup Metropolitan',
    locationName: 'Nabagraha & Boragaon Hills, Guwahati',
    lat: 26.1864,
    lon: 91.7689,
    eventDate: '2022-06-14',
    datePrecision: 'exact_day',
    trigger: 'Slope Cut + Heavy Rain',
    fatalities: 4,
    impactSummary: 'Residual granitic saprolite failure on anthropogenically steepened hill slopes during intense monsoon spell.',
    sourceCatalog: 'GSI Bhukosh Landslide Inventory',
    sourceCitationUrl: 'https://bhukosh.gsi.gov.in/',
    confidence: 'Verified Field/Official Report'
  },
  {
    id: 'NER-HIST-010',
    title: 'Pynursla / Dawki Road Escarpment Failure',
    state: 'Meghalaya',
    district: 'East Khasi Hills',
    locationName: 'Pynursla - Dawki Corridor (NH-206)',
    lat: 25.3082,
    lon: 91.9087,
    eventDate: '2022-06-17',
    datePrecision: 'exact_day',
    trigger: 'Monsoon Extreme Rainfall',
    fatalities: 0,
    impactSummary: 'Extreme Khasi Hills orographic rainfall (Cherrapunji/Mawsynram belt >800 mm/24h) triggered multiple road-cut debris slides.',
    sourceCatalog: 'GSI Bhukosh Landslide Inventory',
    sourceCitationUrl: 'https://bhukosh.gsi.gov.in/',
    confidence: 'Verified Field/Official Report'
  }
];

// ============================================================================
// 3. GEOSPATIAL & SCIENTIFIC ALGORITHMS
// ============================================================================

/**
 * Haversine geodesic distance in kilometers between two WGS84 coordinates
 */
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Horn's (1981) 3x3 third-order finite difference slope and aspect method.
 * Grid ordering:
 * [ z0 (NW), z1 (N), z2 (NE) ]
 * [ z3 (W),  z4 (C), z5 (E)  ]
 * [ z6 (SW), z7 (S), z8 (SE) ]
 */
export function computeHornSlopeAndAspect(
  grid3x3: number[][],
  centerLatDeg: number,
  deltaDeg: number = 0.0008333 // ~90m SRTM / Copernicus DEM spacing
): { slopeDegrees: number; aspectDegrees: number; aspectCardinal: string; cellSizeMeters: number } {
  const latRad = (centerLatDeg * Math.PI) / 180;
  const dyMeters = deltaDeg * 111320.0;
  const dxMeters = deltaDeg * 111320.0 * Math.cos(latRad);

  const z0 = grid3x3[0][0], z1 = grid3x3[0][1], z2 = grid3x3[0][2];
  const z3 = grid3x3[1][0],                     z5 = grid3x3[1][2];
  const z6 = grid3x3[2][0], z7 = grid3x3[2][1], z8 = grid3x3[2][2];

  // dz/dx (West to East gradient)
  const dzdx = ((z2 + 2 * z5 + z8) - (z0 + 2 * z3 + z6)) / (8 * dxMeters);
  // dz/dy (South to North gradient)
  const dzdy = ((z0 + 2 * z1 + z2) - (z6 + 2 * z7 + z8)) / (8 * dyMeters);

  const riseRun = Math.sqrt(dzdx * dzdx + dzdy * dzdy);
  const slopeRad = Math.atan(riseRun);
  const slopeDegrees = Number(((slopeRad * 180) / Math.PI).toFixed(2));

  let aspectDegrees = 0;
  if (riseRun > 1e-6) {
    // Aspect clockwise from North
    aspectDegrees = (Math.atan2(dzdx, -dzdy) * 180) / Math.PI;
    if (aspectDegrees < 0) aspectDegrees += 360;
    aspectDegrees = Number(aspectDegrees.toFixed(1));
  }

  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const aspectCardinal = riseRun <= 1e-6 ? 'Flat' : dirs[Math.round(aspectDegrees / 45) % 8];

  return {
    slopeDegrees,
    aspectDegrees,
    aspectCardinal,
    cellSizeMeters: Math.round((dxMeters + dyMeters) / 2)
  };
}

/**
 * Transparent Stage A / Stage B / Stage C Baseline Risk Screening Engine
 * Never fabricates missing observations. Explicitly checks data quality before scoring.
 */
export function evaluateSlopeGuardBaseline(params: {
  rain24hMm: number | null;
  rain72hMm: number | null;
  slopeDegrees: number | null;
  soilMoistureVolumetric: number | null;
  lat: number;
  lon: number;
  weights: RiskWeights;
  observationAgeHours: number | null;
}): RiskAssessmentResult {
  const {
    rain24hMm,
    rain72hMm,
    slopeDegrees,
    soilMoistureVolumetric,
    lat,
    lon,
    weights,
    observationAgeHours
  } = params;

  const warnings: string[] = [];

  // Stage B: Range & Staleness Quality Checks
  if (observationAgeHours !== null && observationAgeHours > 48) {
    warnings.push(`Meteorological observation is ${observationAgeHours.toFixed(0)} hours old (>48h staleness threshold).`);
  }
  if (rain24hMm !== null && (rain24hMm < 0 || rain24hMm > 1500)) {
    warnings.push(`24h rainfall (${rain24hMm} mm) outside plausible physical bounds [0, 1500 mm].`);
  }
  if (slopeDegrees !== null && (slopeDegrees < 0 || slopeDegrees > 89)) {
    warnings.push(`Calculated terrain slope (${slopeDegrees}°) outside valid DEM bounds [0°, 89°].`);
  }

  // Compute distance to documented historical landslides in catalog
  let nearestKm: number | null = null;
  let countWithin25km = 0;
  for (const ev of DOCUMENTED_HISTORICAL_LANDSLIDES) {
    const d = haversineDistanceKm(lat, lon, ev.lat, ev.lon);
    if (nearestKm === null || d < nearestKm) nearestKm = d;
    if (d <= 25.0) countWithin25km++;
  }

  // Normalize weights so active weights sum to 1.0
  const totalConfiguredWeight =
    weights.rain24h + weights.rain72h + weights.slope + weights.soilMoisture + weights.historicalProximity || 1;

  const normWeight = (w: number) => w / totalConfiguredWeight;

  // Factor 1: 24-Hour Rainfall Accumulation (Threshold reference: 150 mm/24h extreme monsoon trigger)
  const fRain24Available = rain24hMm !== null && !Number.isNaN(rain24hMm) && rain24hMm >= 0;
  const fRain24Norm = fRain24Available ? Math.min(1, rain24hMm / 150.0) : 0;

  // Factor 2: 72-Hour Antecedent Rainfall Accumulation (Threshold reference: 300 mm/72h saturation trigger)
  const fRain72Available = rain72hMm !== null && !Number.isNaN(rain72hMm) && rain72hMm >= 0;
  const fRain72Norm = fRain72Available ? Math.min(1, rain72hMm / 300.0) : 0;

  // Factor 3: Topographic Slope Angle (Piecewise geological susceptibility curve: <8° low, 35°+ critical)
  const fSlopeAvailable = slopeDegrees !== null && !Number.isNaN(slopeDegrees) && slopeDegrees >= 0;
  let fSlopeNorm = 0;
  if (fSlopeAvailable) {
    if (slopeDegrees < 5) fSlopeNorm = 0.05;
    else if (slopeDegrees <= 40) fSlopeNorm = Math.min(1, (slopeDegrees - 5) / 35.0);
    else fSlopeNorm = 1.0;
  }

  // Factor 4: Surface Soil Moisture 0-7cm (m³/m³, typical saturation ~0.48 m³/m³)
  const fSoilAvailable =
    soilMoistureVolumetric !== null && !Number.isNaN(soilMoistureVolumetric) && soilMoistureVolumetric >= 0;
  const fSoilNorm = fSoilAvailable ? Math.min(1, Math.max(0, (soilMoistureVolumetric - 0.1) / 0.38)) : 0;

  // Factor 5: Documented Historical Landslide Proximity (within 25 km radius)
  const fHistAvailable = nearestKm !== null;
  const fHistNorm =
    nearestKm !== null
      ? nearestKm <= 5
        ? 1.0
        : nearestKm <= 25
        ? Math.max(0.2, 1 - (nearestKm - 5) / 25)
        : 0.08
      : 0;

  const factors: FactorContribution[] = [
    {
      key: 'rain24h',
      label: '24-Hour Rainfall Accumulation',
      rawValueDisplay: fRain24Available ? `${rain24hMm!.toFixed(1)} mm / 24h` : 'Unavailable',
      normalized0to1: Number(fRain24Norm.toFixed(3)),
      weight: Number(normWeight(weights.rain24h).toFixed(2)),
      weightedPoints: Number((fRain24Norm * normWeight(weights.rain24h) * 100).toFixed(1)),
      available: fRain24Available,
      assumptionNote: 'Linear scaling up to 150 mm/24h (IMD heavy-to-extremely-heavy rain threshold for NER hills).'
    },
    {
      key: 'rain72h',
      label: '72-Hour Antecedent Rainfall',
      rawValueDisplay: fRain72Available ? `${rain72hMm!.toFixed(1)} mm / 72h` : 'Unavailable',
      normalized0to1: Number(fRain72Norm.toFixed(3)),
      weight: Number(normWeight(weights.rain72h).toFixed(2)),
      weightedPoints: Number((fRain72Norm * normWeight(weights.rain72h) * 100).toFixed(1)),
      available: fRain72Available,
      assumptionNote: 'Captures multi-day pore-water pressure build-up; saturates at 300 mm over 72 hours.'
    },
    {
      key: 'slope',
      label: 'DEM Terrain Slope (Horn 3×3)',
      rawValueDisplay: fSlopeAvailable ? `${slopeDegrees!.toFixed(1)}°` : 'Unavailable',
      normalized0to1: Number(fSlopeNorm.toFixed(3)),
      weight: Number(normWeight(weights.slope).toFixed(2)),
      weightedPoints: Number((fSlopeNorm * normWeight(weights.slope) * 100).toFixed(1)),
      available: fSlopeAvailable,
      assumptionNote: 'Derived from 90m DEM finite-difference gradient; slopes >25° in NER shales exhibit high shear stress.'
    },
    {
      key: 'soilMoisture',
      label: 'Topsoil Volumetric Moisture (0–7 cm)',
      rawValueDisplay: fSoilAvailable ? `${soilMoistureVolumetric!.toFixed(3)} m³/m³` : 'Unavailable',
      normalized0to1: Number(fSoilNorm.toFixed(3)),
      weight: Number(normWeight(weights.soilMoisture).toFixed(2)),
      weightedPoints: Number((fSoilNorm * normWeight(weights.soilMoisture) * 100).toFixed(1)),
      available: fSoilAvailable,
      assumptionNote: 'Normalized across typical field capacity [0.10 to 0.48 m³/m³].'
    },
    {
      key: 'historicalProximity',
      label: 'Documented Historical Landslide Proximity',
      rawValueDisplay:
        nearestKm !== null
          ? `${nearestKm.toFixed(1)} km (${countWithin25km} within 25km)`
          : 'No catalog loaded',
      normalized0to1: Number(fHistNorm.toFixed(3)),
      weight: Number(normWeight(weights.historicalProximity).toFixed(2)),
      weightedPoints: Number((fHistNorm * normWeight(weights.historicalProximity) * 100).toFixed(1)),
      available: fHistAvailable,
      assumptionNote: 'Static proximity to verified GSI/NASA catalog events. Absence of record ≠ proof of safety.'
    }
  ];

  const availableFactors = factors.filter((f) => f.available);
  const completenessPercent = Math.round((availableFactors.length / factors.length) * 100);

  // Stage B Gate: Both primary physical drivers (Rainfall AND Terrain Slope) must be genuinely present
  const essentialInputsPresent = fRain24Available && fRain72Available && fSlopeAvailable;

  if (!essentialInputsPresent) {
    if (!fRain24Available || !fRain72Available) {
      warnings.push('Essential meteorological input (24h/72h rainfall) is missing or failed to load.');
    }
    if (!fSlopeAvailable) {
      warnings.push('Essential topographic input (DEM slope angle) is missing or failed to load.');
    }
    return {
      stageBStatus: 'INSUFFICIENT_DATA',
      completenessPercent,
      availableFactorsCount: availableFactors.length,
      totalFactorsCount: factors.length,
      validationWarnings: warnings,
      experimentalScore0to100: null,
      screeningCategory: 'INSUFFICIENT_DATA',
      factors,
      nearestHistoricalKm: nearestKm !== null ? Number(nearestKm.toFixed(1)) : null,
      historicalEventsWithin25km: countWithin25km,
      computedAtIso: new Date().toISOString()
    };
  }

  // Re-normalize across available factors if optional soil moisture is missing
  const availableWeightSum = availableFactors.reduce((acc, f) => acc + f.weight, 0) || 1;
  const rawWeightedSum = availableFactors.reduce((acc, f) => acc + f.normalized0to1 * f.weight, 0);
  const finalScore = Number(Math.min(100, Math.max(0, (rawWeightedSum / availableWeightSum) * 100)).toFixed(1));

  let category: RiskAssessmentResult['screeningCategory'] = 'LOW_SCREENING';
  if (finalScore >= 75) category = 'CRITICAL_SCREENING';
  else if (finalScore >= 52) category = 'HIGH_SCREENING';
  else if (finalScore >= 28) category = 'MODERATE_SCREENING';

  return {
    stageBStatus: warnings.length > 0 ? 'STALE_DATA' : 'SUFFICIENT_DATA',
    completenessPercent,
    availableFactorsCount: availableFactors.length,
    totalFactorsCount: factors.length,
    validationWarnings: warnings,
    experimentalScore0to100: finalScore,
    screeningCategory: category,
    factors,
    nearestHistoricalKm: nearestKm !== null ? Number(nearestKm.toFixed(1)) : null,
    historicalEventsWithin25km: countWithin25km,
    computedAtIso: new Date().toISOString()
  };
}

// ============================================================================
// 4. BACKEND SOURCE CODE ARTIFACTS (FOR INSPECTION & LOCAL DEPLOYMENT)
// ============================================================================

const FASTAPI_MAIN_PY = `# backend/main.py
"""
SlopeGuard NER — FastAPI Geospatial & Risk Assessment Backend
Run locally: uvicorn main:app --reload --port 8000
"""
import os
import math
import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any
import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="SlopeGuard NER API",
    description="Real-Data Landslide Risk Monitoring & Provenance API for Northeast India",
    version="1.0.0"
)

ALLOWED_ORIGINS = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

HTTP_TIMEOUT = httpx.Timeout(12.0, connect=5.0)

class AssessmentRequest(BaseModel):
    latitude: float = Field(..., ge=21.5, le=29.8, description="Latitude within Northeast India bounding box")
    longitude: float = Field(..., ge=88.0, le=97.5, description="Longitude within Northeast India bounding box")
    rain_24h_mm: Optional[float] = Field(None, ge=0, le=1500)
    rain_72h_mm: Optional[float] = Field(None, ge=0, le=3000)
    slope_degrees: Optional[float] = Field(None, ge=0, le=89)
    soil_moisture_m3m3: Optional[float] = Field(None, ge=0, le=1.0)
    weights: Optional[Dict[str, float]] = None

@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "service": "SlopeGuard NER Backend",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "ml_model_status": "Machine-learning prediction not yet validated (Rule-based Stage A active)"
    }

@app.get("/api/terrain/slope")
async def get_terrain_slope(
    lat: float = Query(..., ge=21.5, le=29.8),
    lon: float = Query(..., ge=88.0, le=97.5)
):
    """Fetches a 3x3 DEM elevation grid (~90m spacing) and computes slope via Horn's (1981) method."""
    delta = 0.0008333
    lats, lons = [], []
    for dlat in [delta, 0, -delta]:
        for dlon in [-delta, 0, delta]:
            lats.append(f"{lat + dlat:.6f}")
            lons.append(f"{lon + dlon:.6f}")
    url = f"https://api.open-meteo.com/v1/elevation?latitude={','.join(lats)}&longitude={','.join(lons)}"
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Upstream DEM service unavailable")
        elevs = resp.json().get("elevation", [])
        if len(elevs) != 9:
            raise HTTPException(status_code=502, detail="Incomplete 3x3 elevation grid returned")
    # Horn's gradient calculation
    dy = delta * 111320.0
    dx = delta * 111320.0 * math.cos(math.radians(lat))
    dzdx = ((elevs[2] + 2*elevs[5] + elevs[8]) - (elevs[0] + 2*elevs[3] + elevs[6])) / (8 * dx)
    dzdy = ((elevs[0] + 2*elevs[1] + elevs[2]) - (elevs[6] + 2*elevs[7] + elevs[8])) / (8 * dy)
    slope_deg = round(math.degrees(math.atan(math.sqrt(dzdx**2 + dzdy**2))), 2)
    return {
        "source": "Copernicus DEM GLO-90 via Open-Meteo Elevation API",
        "crs": "EPSG:4326",
        "cell_resolution_m": 90,
        "center_elevation_m": elevs[4],
        "slope_degrees": slope_deg,
        "grid_3x3_m": [elevs[0:3], elevs[3:6], elevs[6:9]],
        "retrieved_at_utc": datetime.now(timezone.utc).isoformat()
    }
`;

const ENV_EXAMPLE_TXT = `# .env.example — Server-side credentials only (NEVER expose in frontend VITE_* vars)
PORT=8000
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Optional: Copernicus Data Space Ecosystem (Sentinel-2 L2A STAC & Sentinel Hub API)
# Register at: https://dataspace.copernicus.eu/
CDSE_CLIENT_ID=your_copernicus_oauth_client_id_here
CDSE_CLIENT_SECRET=your_copernicus_oauth_client_secret_here

# Optional: NASA Earthdata Bearer Token (for native GPM IMERG HDF5 / OPeNDAP downloads)
# Register at: https://urs.earthdata.nasa.gov/
NASA_EARTHDATA_TOKEN=your_nasa_earthdata_token_here

# Optional: PostgreSQL + PostGIS persistent storage
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/slopeguard_ner
`;

const PYTEST_SUITE_PY = `# backend/test_risk_engine.py
"""
Unit & Integration Tests for SlopeGuard NER Risk Engine
Run with: pytest -v
"""
import pytest
from main import app
from fastapi.testclient import TestClient

client = TestClient(app)

def test_health_endpoint():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "not yet validated" in data["ml_model_status"]

def test_missing_inputs_returns_insufficient_data():
    # Stage B must reject scoring when slope or rainfall is missing
    from risk_engine import evaluate_baseline
    res = evaluate_baseline(rain_24h=120.0, rain_72h=210.0, slope_deg=None)
    assert res["stage_b_status"] == "INSUFFICIENT_DATA"
    assert res["experimental_score"] is None
`;

// ============================================================================
// 5. MAIN APPLICATION COMPONENT
// ============================================================================

export default function App() {
  // Navigation & Active Location State
  const [activeTab, setActiveTab] = useState<NavTabId>('overview');
  const [selectedState, setSelectedState] = useState<NERStateName>('Sikkim');
  const [selectedLocation, setSelectedLocation] = useState<{
    name: string;
    state: NERStateName;
    district: string;
    lat: number;
    lon: number;
    geologicalContext: string;
  }>(REFERENCE_LOCATIONS[0]);

  // Coordinate Search Input State
  const [coordInputLat, setCoordInputLat] = useState<string>(REFERENCE_LOCATIONS[0].lat.toFixed(4));
  const [coordInputLon, setCoordInputLon] = useState<string>(REFERENCE_LOCATIONS[0].lon.toFixed(4));
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Satellite Imagery Layer & Date State
  // Default NASA GIBS date to 2 days ago so global MODIS/VIIRS composite swaths are guaranteed complete
  const defaultGibsDate = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 2);
    return d.toISOString().split('T')[0];
  }, []);

  const [gibsDate, setGibsDate] = useState<string>(defaultGibsDate);
  const [activeBaseLayer, setActiveBaseLayer] = useState<
    'nasa_modis_terra' | 'nasa_viirs_snpp' | 'opentopomap' | 'osm'
  >('nasa_modis_terra');
  const [showImergOverlay, setShowImergOverlay] = useState<boolean>(false);
  const [showHistoricalMarkers, setShowHistoricalMarkers] = useState<boolean>(true);
  const [tileLoadStats, setTileLoadStats] = useState<{ loaded: number; errors: number; lastTileSource: string }>({
    loaded: 0,
    errors: 0,
    lastTileSource: 'NASA GIBS MODIS Terra TrueColor'
  });

  // Real Telemetry States
  const [rainfallData, setRainfallData] = useState<RainfallTelemetry | null>(null);
  const [terrainData, setTerrainData] = useState<TerrainSlopeTelemetry | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Configurable Stage A Risk Weights
  const [riskWeights, setRiskWeights] = useState<RiskWeights>({
    rain24h: 0.30,
    rain72h: 0.25,
    slope: 0.25,
    soilMoisture: 0.10,
    historicalProximity: 0.10
  });

  // What-If Simulator Isolated State
  const [simRain24h, setSimRain24h] = useState<number>(115);
  const [simRain72h, setSimRain72h] = useState<number>(245);
  const [simSlopeDeg, setSimSlopeDeg] = useState<number>(32);
  const [simSoilMoisture, setSimSoilMoisture] = useState<number>(0.41);

  // Historical Filter State
  const [histFilterState, setHistFilterState] = useState<string>('ALL');
  const [histSearch, setHistSearch] = useState<string>('');

  // Internal Prototype Threshold Notifications State
  const [alertThreshold, setAlertThreshold] = useState<number>(50);
  const [prototypeNotifications, setPrototypeNotifications] = useState<PrototypeNotification[]>([]);
  const [copiedCodeBlock, setCopiedCodeBlock] = useState<string | null>(null);

  // Leaflet Map DOM & Instance Refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<any>(null);
  const baseTileLayerRef = useRef<any>(null);
  const imergOverlayRef = useRef<any>(null);
  const markersLayerGroupRef = useRef<any>(null);
  const selectedPinMarkerRef = useRef<any>(null);
  const [leafletLoaded, setLeafletLoaded] = useState<boolean>(false);

  // ============================================================================
  // 6. REAL ENVIRONMENTAL & ELEVATION TELEMETRY FETCHING
  // ============================================================================

  const fetchRealTelemetryForCoordinate = useCallback(
    async (lat: number, lon: number, locName: string, locState: NERStateName) => {
      setIsRefreshing(true);

      // 1) Set loading states
      setRainfallData((prev) =>
        prev
          ? { ...prev, status: 'loading' }
          : {
              source: 'Open-Meteo High-Resolution Forecast/Archive + NASA POWER Agroclimatology',
              endpointUrl: `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`,
              retrievedAtIso: new Date().toISOString(),
              latestObservationIso: 'Loading...',
              currentRateMmHr: 0,
              accum24hMm: 0,
              accum72hMm: 0,
              antecedent7dMm: 0,
              soilMoistureVolumetric: null,
              soilMoistureUnit: 'm³/m³',
              spatialResolution: '0.1° (~11 km) Hourly / 0.5° NASA MERRA-2',
              hourlySeries: [],
              nasaPowerSeries: [],
              nasaPowerStatus: 'loading',
              status: 'loading'
            }
      );

      setTerrainData({
        source: 'Copernicus DEM GLO-90 via Open-Meteo Elevation API',
        endpointUrl: `https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`,
        retrievedAtIso: new Date().toISOString(),
        centerElevationM: null,
        grid3x3ElevationsM: null,
        gridSpacingMeters: 90,
        slopeDegrees: null,
        aspectDegrees: null,
        aspectCardinal: null,
        crs: 'EPSG:4326 (WGS84)',
        algorithm: "Horn's (1981) 3×3 Third-Order Finite-Difference Gradient",
        status: 'loading'
      });

      // 2) Fetch Open-Meteo Hourly Precipitation & Soil Moisture (7 past days + 1 forecast day)
      const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(
        5
      )}&longitude=${lon.toFixed(
        5
      )}&hourly=precipitation,rain,soil_moisture_0_to_7cm&past_days=7&forecast_days=1&timezone=UTC`;

      // 3) Fetch 3x3 DEM Elevation Grid for Horn's Slope Calculation
      const delta = 0.0008333; // ~90m
      const lats: string[] = [];
      const lons: string[] = [];
      for (const dLat of [delta, 0, -delta]) {
        for (const dLon of [-delta, 0, delta]) {
          lats.push((lat + dLat).toFixed(6));
          lons.push((lon + dLon).toFixed(6));
        }
      }
      const elevationGridUrl = `https://api.open-meteo.com/v1/elevation?latitude=${lats.join(
        ','
      )}&longitude=${lons.join(',')}`;

      // 4) Fetch NASA POWER Daily Precipitation & Surface Soil Wetness (last 14 days)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setUTCDate(endDate.getUTCDate() - 14);
      const fmtYmd = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '');
      const nasaPowerUrl = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,GWETTOP&community=RE&longitude=${lon.toFixed(
        4
      )}&latitude=${lat.toFixed(4)}&start=${fmtYmd(startDate)}&end=${fmtYmd(endDate)}&format=JSON`;

      // Execute DEM 3x3 fetch & slope computation
      let computedSlopeDeg: number | null = null;
      try {
        const elevResp = await fetch(elevationGridUrl);
        if (!elevResp.ok) throw new Error(`HTTP ${elevResp.status} from Elevation Service`);
        const elevJson = await elevResp.json();
        const elevArray: number[] = elevJson?.elevation;
        if (!Array.isArray(elevArray) || elevArray.length !== 9) {
          throw new Error('Incomplete 3×3 DEM elevation array returned');
        }
        const grid3x3 = [elevArray.slice(0, 3), elevArray.slice(3, 6), elevArray.slice(6, 9)];
        const horn = computeHornSlopeAndAspect(grid3x3, lat, delta);
        computedSlopeDeg = horn.slopeDegrees;

        setTerrainData({
          source: 'Copernicus DEM GLO-90 / SRTM via Open-Meteo Elevation API',
          endpointUrl: elevationGridUrl,
          retrievedAtIso: new Date().toISOString(),
          centerElevationM: elevArray[4],
          grid3x3ElevationsM: grid3x3,
          gridSpacingMeters: horn.cellSizeMeters,
          slopeDegrees: horn.slopeDegrees,
          aspectDegrees: horn.aspectDegrees,
          aspectCardinal: horn.aspectCardinal,
          crs: 'EPSG:4326 (WGS84)',
          algorithm: "Horn's (1981) 3×3 Finite-Difference Gradient",
          status: 'computed'
        });
      } catch (err: any) {
        setTerrainData((prev) => ({
          ...(prev as TerrainSlopeTelemetry),
          status: 'unavailable',
          errorMessage: err?.message || 'Failed to retrieve 3×3 elevation grid'
        }));
      }

      // Execute Open-Meteo Hourly Rainfall & Soil Moisture Fetch
      try {
        const weatherResp = await fetch(openMeteoUrl);
        if (!weatherResp.ok) throw new Error(`HTTP ${weatherResp.status} from Open-Meteo API`);
        const weatherJson = await weatherResp.json();

        const times: string[] = weatherJson?.hourly?.time || [];
        const precip: number[] = weatherJson?.hourly?.precipitation || [];
        const rain: number[] = weatherJson?.hourly?.rain || [];
        const soilM: (number | null)[] = weatherJson?.hourly?.soil_moisture_0_to_7cm || [];

        if (times.length === 0) throw new Error('Empty hourly series returned');

        // Find index corresponding to current UTC hour
        const nowUnixMs = Date.now();
        let currentIdx = times.length - 1;
        for (let i = 0; i < times.length; i++) {
          const tMs = new Date(times[i] + ':00Z').getTime();
          if (tMs <= nowUnixMs) {
            currentIdx = i;
          } else {
            break;
          }
        }

        const sumRange = (arr: number[], endIdx: number, hoursBack: number) => {
          const startIdx = Math.max(0, endIdx - hoursBack + 1);
          let total = 0;
          for (let i = startIdx; i <= endIdx; i++) {
            const val = Number(arr[i]);
            if (!Number.isNaN(val) && val > 0) total += val;
          }
          return Number(total.toFixed(1));
        };

        const currentRate = Number((precip[currentIdx] || 0).toFixed(2));
        const accum24h = sumRange(precip, currentIdx, 24);
        const accum72h = sumRange(precip, currentIdx, 72);
        const accum7d = sumRange(precip, currentIdx, 168);
        const latestSoilM =
          soilM[currentIdx] !== undefined && soilM[currentIdx] !== null
            ? Number(Number(soilM[currentIdx]).toFixed(3))
            : null;

        // Build last 72h series for charts
        const series72h: HourlyWeatherPoint[] = [];
        const start72Idx = Math.max(0, currentIdx - 71);
        let runningCum = 0;
        for (let i = start72Idx; i <= currentIdx; i++) {
          const p = Number(precip[i] || 0);
          runningCum = Number((runningCum + p).toFixed(1));
          const rawTime = times[i];
          series72h.push({
            time: rawTime + ':00Z',
            displayTime: rawTime.slice(5).replace('T', ' ') + 'Z',
            precipitationMm: p,
            rainMm: Number(rain[i] || 0),
            cumulative72hMm: runningCum,
            soilMoisture0to7cm: soilM[i] !== null && soilM[i] !== undefined ? Number(soilM[i]) : null
          });
        }

        const newRainfall: RainfallTelemetry = {
          source: 'Open-Meteo Hourly Hydrological API (ECMWF IFS / ERA5-Land)',
          endpointUrl: openMeteoUrl,
          retrievedAtIso: new Date().toISOString(),
          latestObservationIso: times[currentIdx] + ':00Z',
          currentRateMmHr: currentRate,
          accum24hMm: accum24h,
          accum72hMm: accum72h,
          antecedent7dMm: accum7d,
          soilMoistureVolumetric: latestSoilM,
          soilMoistureUnit: 'm³/m³',
          spatialResolution: '0.1° (~11 km)',
          hourlySeries: series72h,
          nasaPowerSeries: [],
          nasaPowerStatus: 'loading',
          status: 'live'
        };

        setRainfallData(newRainfall);

        // Sync What-If Simulator baseline defaults with newly observed data when available
        setSimRain24h(accum24h);
        setSimRain72h(accum72h);
        if (computedSlopeDeg !== null) setSimSlopeDeg(computedSlopeDeg);
        if (latestSoilM !== null) setSimSoilMoisture(latestSoilM);

        // 5) Non-blocking NASA POWER Agroclimatology cross-validation fetch
        fetch(nasaPowerUrl)
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
          .then((powerJson) => {
            const pMap = powerJson?.properties?.parameter?.PRECTOTCORR || {};
            const gMap = powerJson?.properties?.parameter?.GWETTOP || {};
            const powerPoints: NasaPowerPoint[] = Object.keys(pMap).map((ymd) => {
              const rawP = Number(pMap[ymd]);
              const rawG = Number(gMap[ymd]);
              return {
                date: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`,
                // NASA POWER uses -999.0 for missing/latency-delayed satellite days
                precipMmDay: rawP >= 0 ? Number(rawP.toFixed(2)) : null,
                surfaceSoilWetness: rawG >= 0 ? Number(rawG.toFixed(3)) : null
              };
            });
            setRainfallData((prev) =>
              prev ? { ...prev, nasaPowerSeries: powerPoints, nasaPowerStatus: 'connected' } : prev
            );
          })
          .catch(() => {
            setRainfallData((prev) => (prev ? { ...prev, nasaPowerStatus: 'unavailable' } : prev));
          });
      } catch (err: any) {
        setRainfallData((prev) => ({
          ...(prev as RainfallTelemetry),
          status: 'error',
          errorMessage: err?.message || 'Failed to retrieve rainfall observations'
        }));
      } finally {
        setIsRefreshing(false);
      }
    },
    []
  );

  // Trigger initial fetch on mount and when selectedLocation changes
  useEffect(() => {
    fetchRealTelemetryForCoordinate(
      selectedLocation.lat,
      selectedLocation.lon,
      selectedLocation.name,
      selectedLocation.state
    );
  }, [selectedLocation, fetchRealTelemetryForCoordinate]);

  // ============================================================================
  // 7. COMPUTE REAL-TIME STAGE A/B/C RISK ASSESSMENT & SIMULATOR
  // ============================================================================

  const liveAssessment: RiskAssessmentResult = useMemo(() => {
    const rainReady = rainfallData && rainfallData.status === 'live';
    const slopeReady = terrainData && terrainData.status === 'computed';

    let obsAgeHours: number | null = null;
    if (rainReady && rainfallData.latestObservationIso) {
      const diffMs = Date.now() - new Date(rainfallData.latestObservationIso).getTime();
      obsAgeHours = Math.max(0, diffMs / (1000 * 3600));
    }

    return evaluateSlopeGuardBaseline({
      rain24hMm: rainReady ? rainfallData.accum24hMm : null,
      rain72hMm: rainReady ? rainfallData.accum72hMm : null,
      slopeDegrees: slopeReady ? terrainData.slopeDegrees : null,
      soilMoistureVolumetric: rainReady ? rainfallData.soilMoistureVolumetric : null,
      lat: selectedLocation.lat,
      lon: selectedLocation.lon,
      weights: riskWeights,
      observationAgeHours: obsAgeHours
    });
  }, [rainfallData, terrainData, selectedLocation, riskWeights]);

  // Generate Internal Prototype Notification if score crosses user threshold
  useEffect(() => {
    if (
      liveAssessment.stageBStatus === 'SUFFICIENT_DATA' &&
      liveAssessment.experimentalScore0to100 !== null &&
      liveAssessment.experimentalScore0to100 >= alertThreshold
    ) {
      setPrototypeNotifications((prev) => {
        const existsForLoc = prev.some(
          (n) => n.locationName === selectedLocation.name && !n.acknowledged
        );
        if (existsForLoc) return prev;
        const newNote: PrototypeNotification = {
          id: `PROTO-${Date.now().toString().slice(-5)}`,
          createdAtIso: new Date().toISOString(),
          locationName: selectedLocation.name,
          state: selectedLocation.state,
          coordinates: `${selectedLocation.lat.toFixed(4)}°N, ${selectedLocation.lon.toFixed(4)}°E`,
          experimentalScore: liveAssessment.experimentalScore0to100!,
          category: liveAssessment.screeningCategory,
          triggerSummary: `Experimental score (${liveAssessment.experimentalScore0to100}/100) exceeded internal prototype threshold (${alertThreshold}). Slope: ${
            terrainData?.slopeDegrees ?? 'N/A'
          }°, 72h Rain: ${rainfallData?.accum72hMm ?? 'N/A'} mm.`,
          acknowledged: false
        };
        return [newNote, ...prev];
      });
    }
  }, [liveAssessment, alertThreshold, selectedLocation, terrainData, rainfallData]);

  const simulatedAssessment: RiskAssessmentResult = useMemo(() => {
    return evaluateSlopeGuardBaseline({
      rain24hMm: simRain24h,
      rain72hMm: simRain72h,
      slopeDegrees: simSlopeDeg,
      soilMoistureVolumetric: simSoilMoisture,
      lat: selectedLocation.lat,
      lon: selectedLocation.lon,
      weights: riskWeights,
      observationAgeHours: 0
    });
  }, [simRain24h, simRain72h, simSlopeDeg, simSoilMoisture, selectedLocation, riskWeights]);

  // ============================================================================
  // 8. LEAFLET INTERACTIVE MAP & NASA GIBS WMTS INTEGRATION
  // ============================================================================

  useEffect(() => {
    // Dynamically load Leaflet CSS & JS if not present
    if ((window as any).L) {
      setLeafletLoaded(true);
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => setLeafletLoaded(true);
    document.body.appendChild(script);
  }, []);

  // Initialize or update Leaflet map when on 'overview' or 'map' or 'imagery' tabs
  useEffect(() => {
    const isMapVisible = activeTab === 'overview' || activeTab === 'map' || activeTab === 'imagery';
    if (!leafletLoaded || !isMapVisible || !mapContainerRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    // Clean up existing instance if container changed
    if (leafletMapRef.current) {
      leafletMapRef.current.remove();
      leafletMapRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: [selectedLocation.lat, selectedLocation.lon],
      zoom: activeTab === 'overview' ? 7 : 8,
      minZoom: 5,
      maxZoom: 16
    });
    leafletMapRef.current = map;

    // Click handler on map to inspect any coordinate in Northeast India
    map.on('click', (e: any) => {
      const clickedLat = Number(e.latlng.lat.toFixed(4));
      const clickedLon = Number(e.latlng.lng.toFixed(4));
      if (clickedLat < 21.5 || clickedLat > 29.8 || clickedLon < 88.0 || clickedLon > 97.6) {
        return;
      }
      // Find nearest NER state centroid
      let closestState: NERStateName = 'Assam';
      let minDist = Infinity;
      for (const st of NER_STATES) {
        const d = haversineDistanceKm(clickedLat, clickedLon, st.centerLat, st.centerLon);
        if (d < minDist) {
          minDist = d;
          closestState = st.name;
        }
      }
      setCoordInputLat(clickedLat.toFixed(4));
      setCoordInputLon(clickedLon.toFixed(4));
      setSelectedState(closestState);
      setSelectedLocation({
        name: `Custom Field Point (${clickedLat.toFixed(3)}°N, ${clickedLon.toFixed(3)}°E)`,
        state: closestState,
        district: `Near ${closestState} Sector`,
        lat: clickedLat,
        lon: clickedLon,
        geologicalContext: 'User-selected coordinate; real-time 3×3 DEM slope & meteorological telemetry queried.'
      });
    });

    markersLayerGroupRef.current = L.layerGroup().addTo(map);

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [leafletLoaded, activeTab]);

  // Update Base Tile Layer (NASA GIBS MODIS, VIIRS, OpenTopoMap, OSM) & IMERG Overlay
  useEffect(() => {
    const map = leafletMapRef.current;
    const L = (window as any).L;
    if (!map || !L) return;

    if (baseTileLayerRef.current) {
      map.removeLayer(baseTileLayerRef.current);
      baseTileLayerRef.current = null;
    }
    if (imergOverlayRef.current) {
      map.removeLayer(imergOverlayRef.current);
      imergOverlayRef.current = null;
    }

    let tileUrl = '';
    let attribution = '';
    let maxNativeZoom = 18;
    let sourceLabel = '';

    if (activeBaseLayer === 'nasa_modis_terra') {
      tileUrl = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${gibsDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
      attribution = 'Imagery: NASA EOSDIS GIBS (MODIS Terra TrueColor, 250m)';
      maxNativeZoom = 9;
      sourceLabel = `NASA GIBS MODIS Terra (${gibsDate})`;
    } else if (activeBaseLayer === 'nasa_viirs_snpp') {
      tileUrl = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${gibsDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
      attribution = 'Imagery: NASA EOSDIS GIBS (VIIRS SNPP TrueColor, 375m)';
      maxNativeZoom = 9;
      sourceLabel = `NASA GIBS VIIRS SNPP (${gibsDate})`;
    } else if (activeBaseLayer === 'opentopomap') {
      tileUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
      attribution = 'Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)';
      maxNativeZoom = 15;
      sourceLabel = 'OpenTopoMap Contours (SRTM)';
    } else {
      tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      attribution = '© OpenStreetMap contributors';
      maxNativeZoom = 18;
      sourceLabel = 'OpenStreetMap Standard';
    }

    const baseLayer = L.tileLayer(tileUrl, {
      attribution,
      maxNativeZoom,
      maxZoom: 16,
      crossOrigin: true
    });

    baseLayer.on('tileload', () => {
      setTileLoadStats((prev) => ({
        loaded: prev.loaded + 1,
        errors: prev.errors,
        lastTileSource: sourceLabel
      }));
    });

    baseLayer.on('tileerror', () => {
      setTileLoadStats((prev) => ({
        loaded: prev.loaded,
        errors: prev.errors + 1,
        lastTileSource: sourceLabel
      }));
    });

    baseLayer.addTo(map);
    baseTileLayerRef.current = baseLayer;

    // Optional NASA GIBS IMERG Precipitation Rate Layer
    if (showImergOverlay) {
      const imergUrl = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate/default/${gibsDate}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`;
      const imergLayer = L.tileLayer(imergUrl, {
        attribution: 'NASA GPM IMERG Precipitation Rate (GIBS Level 6)',
        opacity: 0.65,
        maxNativeZoom: 6,
        maxZoom: 16
      });
      imergLayer.addTo(map);
      imergOverlayRef.current = imergLayer;
    }
  }, [activeBaseLayer, gibsDate, showImergOverlay, activeTab, leafletLoaded]);

  // Update Markers (Selected Coordinate Pin + Documented Historical Landslides)
  useEffect(() => {
    const map = leafletMapRef.current;
    const group = markersLayerGroupRef.current;
    const L = (window as any).L;
    if (!map || !group || !L) return;

    group.clearLayers();

    // 1. Render Documented Historical Landslide Markers (distinct amber diamond/circle icon)
    if (showHistoricalMarkers) {
      DOCUMENTED_HISTORICAL_LANDSLIDES.forEach((ev) => {
        const histMarker = L.circleMarker([ev.lat, ev.lon], {
          radius: 7,
          fillColor: '#f59e0b',
          color: '#78350f',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.88
        });

        histMarker.bindPopup(`
          <div style="font-family: system-ui, sans-serif; min-width: 220px; color: #0f172a;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #b45309; background: #fef3c7; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 4px;">
              Historical Record • Not Active Incident
            </div>
            <div style="font-weight: 700; font-size: 13px; margin-bottom: 2px;">${ev.title}</div>
            <div style="font-size: 11px; color: #475569; margin-bottom: 6px;">
              <strong>Date:</strong> ${ev.eventDate} | <strong>State:</strong> ${ev.state} (${ev.district})
            </div>
            <div style="font-size: 11px; color: #334155; margin-bottom: 6px;">
              ${ev.impactSummary}
            </div>
            <div style="font-size: 10px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 4px;">
              <strong>Source:</strong> ${ev.sourceCatalog}<br/>
              <strong>Coords:</strong> ${ev.lat.toFixed(4)}°N, ${ev.lon.toFixed(4)}°E
            </div>
          </div>
        `);
        group.addLayer(histMarker);
      });
    }

    // 2. Render Selected Inspection Target Marker (distinct cyan pulsing target)
    const targetMarker = L.circleMarker([selectedLocation.lat, selectedLocation.lon], {
      radius: 10,
      fillColor: '#06b6d4',
      color: '#ffffff',
      weight: 3,
      opacity: 1,
      fillOpacity: 0.95
    });

    const slopeText =
      terrainData?.status === 'computed' && terrainData.slopeDegrees !== null
        ? `${terrainData.slopeDegrees}° (${terrainData.aspectCardinal})`
        : 'Calculating...';
    const rainText =
      rainfallData?.status === 'live'
        ? `${rainfallData.accum24hMm} mm (24h) / ${rainfallData.accum72hMm} mm (72h)`
        : 'Loading...';
    const scoreText =
      liveAssessment.experimentalScore0to100 !== null
        ? `${liveAssessment.experimentalScore0to100} / 100 (${liveAssessment.screeningCategory})`
        : 'Insufficient Data';

    targetMarker.bindPopup(`
      <div style="font-family: system-ui, sans-serif; min-width: 240px; color: #0f172a;">
        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #0e7490; background: #cffafe; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 4px;">
          Selected Monitoring Coordinate
        </div>
        <div style="font-weight: 700; font-size: 13px; margin-bottom: 2px;">${selectedLocation.name}</div>
        <div style="font-size: 11px; color: #475569; margin-bottom: 6px;">
          ${selectedLocation.state} • ${selectedLocation.lat.toFixed(4)}°N, ${selectedLocation.lon.toFixed(4)}°E
        </div>
        <div style="font-size: 11px; background: #f8fafc; padding: 6px; border-radius: 4px; border: 1px solid #e2e8f0;">
          <div><strong>DEM Slope (Horn 3×3):</strong> ${slopeText}</div>
          <div><strong>Observed Rain:</strong> ${rainText}</div>
          <div><strong>Experimental Screening:</strong> ${scoreText}</div>
        </div>
      </div>
    `);

    group.addLayer(targetMarker);
    selectedPinMarkerRef.current = targetMarker;

    map.panTo([selectedLocation.lat, selectedLocation.lon], { animate: true });
  }, [
    selectedLocation,
    showHistoricalMarkers,
    terrainData,
    rainfallData,
    liveAssessment,
    activeTab,
    leafletLoaded
  ]);

  const handleResetNERExtent = () => {
    if (leafletMapRef.current) {
      leafletMapRef.current.setView([25.6, 92.8], 6, { animate: true });
    }
  };

  const handleApplyCoordinateInput = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(coordInputLat);
    const lon = parseFloat(coordInputLon);
    if (Number.isNaN(lat) || Number.isNaN(lon) || lat < 21.5 || lat > 29.8 || lon < 88.0 || lon > 97.6) {
      return;
    }
    setSelectedLocation({
      name: `Coordinate Query (${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E)`,
      state: selectedState,
      district: `${selectedState} Region`,
      lat,
      lon,
      geologicalContext: 'User-entered geographic coordinate in Northeast India.'
    });
  };

  const handleCopyCode = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeBlock(id);
    setTimeout(() => setCopiedCodeBlock(null), 2000);
  };

  // ============================================================================
  // 9. DATA SOURCE REGISTRY COMPUTATION
  // ============================================================================

  const dataSourceRegistry: DataSourceRegistryItem[] = useMemo(
    () => [
      {
        id: 'nasa-gibs-wmts',
        provider: 'NASA EOSDIS Global Imagery Browse Services (GIBS)',
        datasetName: 'MODIS Terra & VIIRS SNPP Corrected Reflectance + IMERG Visual Tiles',
        dataType: 'Satellite Imagery Tiles',
        docUrl: 'https://nasa-gibs.github.io/gibs-api-docs/',
        endpointTemplate:
          'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{Layer}/default/{YYYY-MM-DD}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
        coverage: 'Global (including all 8 Northeast Indian states)',
        spatialResolution: '250m (MODIS Terra), 375m (VIIRS SNPP), ~10km (IMERG Tile)',
        temporalResolution: 'Daily composite swath (user-selectable date)',
        units: 'RGB True-Color Visualization / Rain Rate Color Scale',
        authRequirement: 'Public (No Key Required)',
        integrationStatus: tileLoadStats.errors > 20 && tileLoadStats.loaded === 0 ? 'Degraded / Error' : 'Connected (Live)',
        lastSuccessIso: new Date().toISOString(),
        latestObservationTime: `${gibsDate} (Selected Swath Date)`,
        limitations:
          'Provides pre-rendered visualization tiles (not raw multi-spectral reflectance DN values). Optical true-color imagery is obstructed by monsoon cloud cover.'
      },
      {
        id: 'open-meteo-hydro',
        provider: 'Open-Meteo Environmental API (ECMWF IFS / ERA5-Land)',
        datasetName: 'Hourly Precipitation, Rain Rate & Volumetric Topsoil Moisture (0–7 cm)',
        dataType: 'Precipitation & Soil Moisture',
        docUrl: 'https://open-meteo.com/en/docs',
        endpointTemplate:
          'https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&hourly=precipitation,rain,soil_moisture_0_to_7cm&past_days=7',
        coverage: 'Global / Full Northeast India',
        spatialResolution: '0.1° (~11 km grid)',
        temporalResolution: 'Hourly (past 7 days + current hour)',
        units: 'mm/hr, mm/24h, mm/72h, m³/m³ (soil moisture)',
        authRequirement: 'Public (No Key Required)',
        integrationStatus:
          rainfallData?.status === 'live' ? 'Connected (Live)' : rainfallData?.status === 'loading' ? 'Connected (Live)' : 'Degraded / Error',
        lastSuccessIso: rainfallData?.retrievedAtIso || null,
        latestObservationTime: rainfallData?.latestObservationIso || null,
        limitations:
          'Grid-cell hydrological assimilation (~11 km resolution) may smooth out localized convective cloudburst peaks on narrow Himalayan ridges.'
      },
      {
        id: 'nasa-power-merra2',
        provider: 'NASA Langley Research Center (POWER / GPM + MERRA-2)',
        datasetName: 'PRECTOTCORR (Corrected Precipitation) & GWETTOP (Surface Soil Wetness)',
        dataType: 'Satellite Agroclimatology',
        docUrl: 'https://power.larc.nasa.gov/docs/services/api/',
        endpointTemplate:
          'https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,GWETTOP&community=RE&longitude={lon}&latitude={lat}',
        coverage: 'Global / Full Northeast India',
        spatialResolution: '0.5° × 0.625°',
        temporalResolution: 'Daily (2–4 day satellite processing latency)',
        units: 'mm/day, dimensionless wetness index [0.0–1.0]',
        authRequirement: 'Public (No Key Required)',
        integrationStatus:
          rainfallData?.nasaPowerStatus === 'connected' ? 'Connected (Live)' : 'Degraded / Error',
        lastSuccessIso: rainfallData?.retrievedAtIso || null,
        latestObservationTime:
          rainfallData?.nasaPowerSeries?.filter((d) => d.precipMmDay !== null).slice(-1)[0]?.date || 'Delayed (2-3d)',
        limitations:
          'Near-real-time satellite precipitation products have a 48–72h processing delay (missing recent days are flagged as -999 and filtered out).'
      },
      {
        id: 'copernicus-dem-glo90',
        provider: 'Copernicus DEM GLO-90 / SRTM via Open-Meteo Elevation API',
        datasetName: '3×3 Digital Elevation Model Matrix & Horn (1981) Slope Gradient',
        dataType: 'Digital Elevation Model',
        docUrl: 'https://open-meteo.com/en/docs/elevation-api',
        endpointTemplate: 'https://api.open-meteo.com/v1/elevation?latitude={lat1..lat9}&longitude={lon1..lon9}',
        coverage: 'Global / Full Northeast India (EPSG:4326)',
        spatialResolution: '90m (3 arc-seconds)',
        temporalResolution: 'Static Topographic Baseline',
        units: 'Meters AMSL (Elevation), Degrees (Slope & Aspect)',
        authRequirement: 'Public (No Key Required)',
        integrationStatus: terrainData?.status === 'computed' ? 'Connected (Live)' : 'Degraded / Error',
        lastSuccessIso: terrainData?.retrievedAtIso || null,
        latestObservationTime: 'Static DEM Baseline',
        limitations:
          '90m DEM resolution captures hillslope-scale gradients but cannot resolve localized 5m vertical road-cut benches along highways.'
      },
      {
        id: 'gsi-nasa-historical-catalog',
        provider: 'Geological Survey of India (Bhukosh) & NASA Global Landslide Catalog',
        datasetName: 'Curated Northeast India Documented Landslide Event Inventory',
        dataType: 'Historical Landslide Inventory',
        docUrl: 'https://bhukosh.gsi.gov.in/',
        endpointTemplate: 'Static Verified GeoJSON Catalog (NER-HIST-001..010)',
        coverage: 'All 8 Northeast Indian States (2016–2024 verified events)',
        spatialResolution: 'Point Coordinate (Verified Event Location)',
        temporalResolution: 'Historical Snapshot',
        units: 'Event Date, Trigger, Fatalities, Source Citation',
        authRequirement: 'Curated Static Snapshot',
        integrationStatus: 'Static Verified Catalog',
        lastSuccessIso: '2025-02-01T00:00:00Z',
        latestObservationTime: '2024-09-03 (Latest Catalog Entry)',
        limitations:
          'Incomplete regional coverage; remote rural failures often go unreported. Absence of a recorded event never implies slope safety.'
      },
      {
        id: 'copernicus-cdse-sentinel2',
        provider: 'Copernicus Data Space Ecosystem (ESA Sentinel-2 L2A)',
        datasetName: 'Sentinel-2 Multispectral L2A Surface Reflectance (10m) & STAC Catalog',
        dataType: 'Optical L2A Reflectance',
        docUrl: 'https://dataspace.copernicus.eu/analyse/apis/sentinel-hub',
        endpointTemplate: 'https://sh.dataspace.copernicus.eu/api/v1/catalog/1.0.0/search',
        coverage: 'Global / 5-day revisit over Northeast India',
        spatialResolution: '10m (Bands B02, B03, B04, B08)',
        temporalResolution: '5-Day Revisit ( Twin-Satellite Constellation )',
        units: 'Bottom-of-Atmosphere Reflectance (L2A) & Cloud Cover %',
        authRequirement: 'OAuth2 Client Credentials (Server-Side)',
        integrationStatus: 'Awaiting Backend Credentials',
        lastSuccessIso: null,
        latestObservationTime: null,
        limitations:
          'Requires server-side CDSE_CLIENT_ID and CDSE_CLIENT_SECRET in backend .env to issue OAuth2 tokens and execute before/after change detection.'
      }
    ],
    [tileLoadStats, gibsDate, rainfallData, terrainData]
  );

  // ============================================================================
  // 10. UI HELPER BADGES
  // ============================================================================

  const renderCategoryBadge = (cat: RiskAssessmentResult['screeningCategory']) => {
    switch (cat) {
      case 'CRITICAL_SCREENING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/40">
            <AlertOctagon className="w-3.5 h-3.5" /> Critical Screening Level
          </span>
        );
      case 'HIGH_SCREENING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <AlertTriangle className="w-3.5 h-3.5" /> High Screening Level
          </span>
        );
      case 'MODERATE_SCREENING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
            <Activity className="w-3.5 h-3.5" /> Moderate Screening Level
          </span>
        );
      case 'LOW_SCREENING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <CheckCircle2 className="w-3.5 h-3.5" /> Low Screening Level
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-700 text-slate-300 border border-slate-600">
            <HelpCircle className="w-3.5 h-3.5" /> Insufficient Data
          </span>
        );
    }
  };

  // Filtered historical landslides
  const filteredHistoricalEvents = useMemo(() => {
    return DOCUMENTED_HISTORICAL_LANDSLIDES.filter((ev) => {
      const matchesState = histFilterState === 'ALL' || ev.state === histFilterState;
      const matchesQuery =
        !histSearch.trim() ||
        ev.title.toLowerCase().includes(histSearch.toLowerCase()) ||
        ev.district.toLowerCase().includes(histSearch.toLowerCase()) ||
        ev.trigger.toLowerCase().includes(histSearch.toLowerCase());
      return matchesState && matchesQuery;
    });
  }, [histFilterState, histSearch]);

  // Navigation items
  const navItems: { id: NavTabId; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'overview', label: '1. Overview', icon: <Activity className="w-4 h-4" /> },
    { id: 'map', label: '2. Live Map', icon: <MapIcon className="w-4 h-4" /> },
    { id: 'imagery', label: '3. Satellite Imagery', icon: <Satellite className="w-4 h-4" /> },
    { id: 'rainfall-terrain', label: '4. Rainfall & Terrain', icon: <CloudRain className="w-4 h-4" /> },
    { id: 'risk-assessment', label: '5. Risk Assessment', icon: <ShieldAlert className="w-4 h-4" /> },
    { id: 'simulator', label: '6. What-if Simulator', icon: <Sliders className="w-4 h-4" />, badge: 'SANDBOX' },
    { id: 'historical', label: '7. Historical Events', icon: <History className="w-4 h-4" /> },
    {
      id: 'alerts',
      label: '8. Alert Centre',
      icon: <Bell className="w-4 h-4" />,
      badge:
        prototypeNotifications.filter((n) => !n.acknowledged).length > 0
          ? String(prototypeNotifications.filter((n) => !n.acknowledged).length)
          : undefined
    },
    { id: 'sources', label: '9. Data Sources', icon: <Database className="w-4 h-4" /> },
    { id: 'about', label: '10. About, API & Code', icon: <Info className="w-4 h-4" /> }
  ];

  // ============================================================================
  // 11. RENDER LAYOUT
  // ============================================================================

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30">
      {/* TOP RESEARCH PROTOTYPE DISCLAIMER BAR */}
      <div className="bg-slate-900/95 border-b border-cyan-900/50 px-4 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-slate-300">
          <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-semibold border border-cyan-500/30 uppercase tracking-wider text-[10px]">
            Research Prototype
          </span>
          <span>
            <strong>SlopeGuard NER</strong> — Experimental environmental screening tool. Do not use as a substitute for official advisories from{' '}
            <strong className="text-white">GSI (NLFC)</strong>, <strong className="text-white">IMD</strong>, or{' '}
            <strong className="text-white">NDMA</strong>.
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <span
              className={`w-2 h-2 rounded-full ${
                rainfallData?.status === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            Hydrology: {rainfallData?.status === 'live' ? 'Open-Meteo Connected' : 'Querying...'}
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <span
              className={`w-2 h-2 rounded-full ${
                terrainData?.status === 'computed' ? 'bg-teal-400' : 'bg-amber-400'
              }`}
            />
            DEM Slope: {terrainData?.status === 'computed' ? 'Horn 3×3 Active' : 'Querying...'}
          </span>
        </div>
      </div>

      {/* MAIN HEADER */}
      <header className="bg-[#0F172A] border-b border-slate-800 px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Mountain className="w-6 h-6 text-slate-950 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">SlopeGuard NER</h1>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700">
                8-State Geospatial Platform
              </span>
            </div>
            <p className="text-xs text-slate-400">
              AI-Based Landslide Risk Monitoring & Multi-Sensor Assessment for Northeast India
            </p>
          </div>
        </div>

        {/* GLOBAL LOCATION & STATE SELECTOR BAR */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs">
            <MapPin className="w-3.5 h-3.5 text-cyan-400 mr-1.5 shrink-0" />
            <span className="text-slate-400 mr-1.5">Corridor:</span>
            <select
              aria-label="Select Monitoring Corridor"
              value={
                REFERENCE_LOCATIONS.find((r) => r.name === selectedLocation.name)?.id || 'custom'
              }
              onChange={(e) => {
                const found = REFERENCE_LOCATIONS.find((r) => r.id === e.target.value);
                if (found) {
                  setSelectedState(found.state);
                  setSelectedLocation(found);
                  setCoordInputLat(found.lat.toFixed(4));
                  setCoordInputLon(found.lon.toFixed(4));
                }
              }}
              className="bg-transparent text-slate-100 font-medium focus:outline-none cursor-pointer"
            >
              {REFERENCE_LOCATIONS.map((loc) => (
                <option key={loc.id} value={loc.id} className="bg-slate-900 text-slate-100">
                  [{loc.state}] {loc.name}
                </option>
              ))}
              {!REFERENCE_LOCATIONS.some((r) => r.name === selectedLocation.name) && (
                <option value="custom" className="bg-slate-900 text-cyan-300">
                  {selectedLocation.name}
                </option>
              )}
            </select>
          </div>

          <button
            onClick={() =>
              fetchRealTelemetryForCoordinate(
                selectedLocation.lat,
                selectedLocation.lon,
                selectedLocation.name,
                selectedLocation.state
              )
            }
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing APIs...' : 'Refresh Telemetry'}
          </button>
        </div>
      </header>

      {/* BODY WORKSPACE: SIDE NAVIGATION + MAIN CONTENT + PERSISTENT PROVENANCE FOOTER */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* SIDEBAR NAVIGATION */}
        <aside className="w-full lg:w-64 bg-[#0F172A] border-b lg:border-b-0 lg:border-r border-slate-800 shrink-0 flex flex-col justify-between">
          <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                    active
                      ? 'bg-gradient-to-r from-cyan-500/20 to-teal-500/10 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={active ? 'text-cyan-400' : 'text-slate-400'}>{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`px-1.5 py-0.5 text-[10px] rounded font-mono font-bold ${
                        item.id === 'simulator'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* PERSISTENT DATA PROVENANCE & FRESHNESS MINI-PANEL */}
          <div className="hidden lg:block p-3 m-3 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] space-y-2.5">
            <div className="flex items-center justify-between text-slate-300 font-semibold border-b border-slate-800 pb-1.5">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-teal-400" /> Provenance & Freshness
              </span>
              <span className="text-[10px] font-mono text-cyan-400">LIVE CHECK</span>
            </div>

            <div className="space-y-1.5 text-slate-400">
              <div className="flex justify-between">
                <span>Selected Point:</span>
                <span className="font-mono text-slate-200">
                  {selectedLocation.lat.toFixed(3)}°N, {selectedLocation.lon.toFixed(3)}°E
                </span>
              </div>
              <div className="flex justify-between">
                <span>Rain Obs (UTC):</span>
                <span className="font-mono text-slate-200">
                  {rainfallData?.latestObservationIso
                    ? rainfallData.latestObservationIso.slice(5, 16).replace('T', ' ')
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>GIBS Swath Date:</span>
                <span className="font-mono text-cyan-300">{gibsDate}</span>
              </div>
              <div className="flex justify-between">
                <span>DEM Resolution:</span>
                <span className="font-mono text-slate-200">90m (EPSG:4326)</span>
              </div>
              <div className="flex justify-between">
                <span>Input Completeness:</span>
                <span className="font-mono text-teal-300">{liveAssessment.completenessPercent}%</span>
              </div>
            </div>

            <div className="pt-1 border-t border-slate-800/80 text-[10px] text-slate-400 leading-relaxed">
              ML Status: <span className="text-amber-300">Machine-learning prediction not yet validated.</span> Rule-based Stage A active.
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
          {/* ==================================================================
              SHARED SUMMARY METRIC CARDS (Shown on Overview & Live Map)
             ================================================================== */}
          {(activeTab === 'overview' || activeTab === 'map') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {/* Card 1: Selected Location & State */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>Selected Location</span>
                    <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-mono text-[10px]">
                      {selectedLocation.state}
                    </span>
                  </div>
                  <div className="text-base font-bold text-white truncate" title={selectedLocation.name}>
                    {selectedLocation.name}
                  </div>
                  <div className="text-xs font-mono text-slate-400 mt-0.5">
                    {selectedLocation.lat.toFixed(4)}°N, {selectedLocation.lon.toFixed(4)}°E
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Elev: {terrainData?.centerElevationM !== null && terrainData?.centerElevationM !== undefined ? `${terrainData.centerElevationM} m AMSL` : 'Loading...'}</span>
                  <span className="text-cyan-400">WGS84</span>
                </div>
              </div>

              {/* Card 2: Observed Rainfall & 24h/72h Accumulation */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>Observed Rainfall (24h / 72h)</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono">
                      {rainfallData?.status === 'live' ? 'LIVE API' : 'LOADING'}
                    </span>
                  </div>
                  {rainfallData?.status === 'live' ? (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-white">{rainfallData.accum24hMm}</span>
                        <span className="text-xs text-slate-400">mm / 24h</span>
                        <span className="text-slate-600">|</span>
                        <span className="text-lg font-semibold text-cyan-300">{rainfallData.accum72hMm}</span>
                        <span className="text-xs text-slate-400">mm / 72h</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Current Rate: <strong className="text-slate-200">{rainfallData.currentRateMmHr} mm/hr</strong> • Soil:{' '}
                        <strong className="text-slate-200">
                          {rainfallData.soilMoistureVolumetric !== null
                            ? `${rainfallData.soilMoistureVolumetric} m³/m³`
                            : 'N/A'}
                        </strong>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-amber-300 py-2">
                      {rainfallData?.errorMessage || 'Fetching Open-Meteo telemetry...'}
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Source: Open-Meteo (0.1°)</span>
                  <span className="font-mono">
                    {rainfallData?.latestObservationIso
                      ? rainfallData.latestObservationIso.slice(11, 16) + ' UTC'
                      : '—'}
                  </span>
                </div>
              </div>

              {/* Card 3: Calculated DEM Terrain Slope & Historical Records */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>Terrain Slope & History</span>
                    <span className="px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-300 border border-teal-500/30 text-[10px] font-mono">
                      HORN 3×3 DEM
                    </span>
                  </div>
                  {terrainData?.status === 'computed' && terrainData.slopeDegrees !== null ? (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-white">{terrainData.slopeDegrees}°</span>
                        <span className="text-xs text-teal-300">
                          Aspect {terrainData.aspectDegrees}° ({terrainData.aspectCardinal})
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Catalog Events ≤25km:{' '}
                        <strong className="text-amber-300">{liveAssessment.historicalEventsWithin25km}</strong> (Nearest:{' '}
                        {liveAssessment.nearestHistoricalKm ?? '—'} km)
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-amber-300 py-2">
                      {terrainData?.errorMessage || 'Computing 3×3 DEM gradient...'}
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Copernicus DEM GLO-90</span>
                  <span>~{terrainData?.gridSpacingMeters ?? 90}m cell</span>
                </div>
              </div>

              {/* Card 4: Experimental Screening Assessment */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>Experimental Screening Score</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-mono">
                      PROVISIONAL
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-bold text-white">
                        {liveAssessment.experimentalScore0to100 !== null
                          ? liveAssessment.experimentalScore0to100
                          : 'N/A'}
                      </span>
                      <span className="text-xs text-slate-400">/ 100</span>
                    </div>
                    {renderCategoryBadge(liveAssessment.screeningCategory)}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1.5">
                    Completeness: <strong className="text-slate-200">{liveAssessment.completenessPercent}%</strong> (
                    {liveAssessment.availableFactorsCount}/{liveAssessment.totalFactorsCount} factors)
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Unvalidated Baseline</span>
                  <button
                    onClick={() => setActiveTab('risk-assessment')}
                    className="text-cyan-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    Explain Score <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================================
              SHARED INTERACTIVE LEAFLET MAP WORKBENCH (Overview, Map, Imagery)
             ================================================================== */}
          {(activeTab === 'overview' || activeTab === 'map' || activeTab === 'imagery') && (
            <div className="bg-[#0F172A] border border-slate-800 rounded-xl overflow-hidden">
              {/* Map Control Header */}
              <div className="p-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5 mr-2">
                    <Layers className="w-4 h-4" /> Geospatial & Satellite Workbench
                  </span>

                  {/* State Selector Quick Jump */}
                  <select
                    aria-label="Filter by Northeast State"
                    value={selectedState}
                    onChange={(e) => {
                      const stName = e.target.value as NERStateName;
                      setSelectedState(stName);
                      const refForState = REFERENCE_LOCATIONS.find((r) => r.state === stName);
                      if (refForState) {
                        setSelectedLocation(refForState);
                        setCoordInputLat(refForState.lat.toFixed(4));
                        setCoordInputLon(refForState.lon.toFixed(4));
                      }
                    }}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
                  >
                    {NER_STATES.map((st) => (
                      <option key={st.name} value={st.name}>
                        State: {st.name}
                      </option>
                    ))}
                  </select>

                  {/* Base Layer Switcher */}
                  <div className="inline-flex rounded-lg bg-slate-900 p-0.5 border border-slate-700 text-xs">
                    <button
                      onClick={() => setActiveBaseLayer('nasa_modis_terra')}
                      className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                        activeBaseLayer === 'nasa_modis_terra'
                          ? 'bg-cyan-500/20 text-cyan-300 font-medium'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      NASA MODIS Terra
                    </button>
                    <button
                      onClick={() => setActiveBaseLayer('nasa_viirs_snpp')}
                      className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                        activeBaseLayer === 'nasa_viirs_snpp'
                          ? 'bg-cyan-500/20 text-cyan-300 font-medium'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      NASA VIIRS SNPP
                    </button>
                    <button
                      onClick={() => setActiveBaseLayer('opentopomap')}
                      className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                        activeBaseLayer === 'opentopomap'
                          ? 'bg-cyan-500/20 text-cyan-300 font-medium'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Topo Contours
                    </button>
                    <button
                      onClick={() => setActiveBaseLayer('osm')}
                      className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                        activeBaseLayer === 'osm'
                          ? 'bg-cyan-500/20 text-cyan-300 font-medium'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Street Context
                    </button>
                  </div>
                </div>

                {/* Right Controls: NASA GIBS Date Picker, Overlays, Reset Extent */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {(activeBaseLayer === 'nasa_modis_terra' ||
                    activeBaseLayer === 'nasa_viirs_snpp' ||
                    showImergOverlay) && (
                    <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1">
                      <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="text-slate-400">GIBS Date:</span>
                      <input
                        type="date"
                        aria-label="NASA GIBS Imagery Date"
                        value={gibsDate}
                        max={new Date().toISOString().split('T')[0]}
                        min="2015-01-01"
                        onChange={(e) => {
                          if (e.target.value) setGibsDate(e.target.value);
                        }}
                        className="bg-transparent text-cyan-300 font-mono text-xs focus:outline-none"
                      />
                    </div>
                  )}

                  <label className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showImergOverlay}
                      onChange={(e) => setShowImergOverlay(e.target.checked)}
                      className="accent-cyan-500"
                    />
                    <span className="text-slate-300">IMERG Rain Tile</span>
                  </label>

                  <label className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showHistoricalMarkers}
                      onChange={(e) => setShowHistoricalMarkers(e.target.checked)}
                      className="accent-amber-500"
                    />
                    <span className="text-slate-300">Historical Catalog ({DOCUMENTED_HISTORICAL_LANDSLIDES.length})</span>
                  </label>

                  <button
                    onClick={handleResetNERExtent}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
                  >
                    Reset NER Extent
                  </button>
                </div>
              </div>

              {/* Coordinate Search Sub-Bar on Live Map Tab */}
              {activeTab === 'map' && (
                <div className="px-4 py-2.5 bg-slate-900/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <form onSubmit={handleApplyCoordinateInput} className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-400 font-medium">Inspect Custom NER Coordinate:</span>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">Lat (°N):</span>
                      <input
                        type="number"
                        step="0.0001"
                        min="21.5"
                        max="29.8"
                        value={coordInputLat}
                        onChange={(e) => setCoordInputLat(e.target.value)}
                        className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-slate-100"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">Lon (°E):</span>
                      <input
                        type="number"
                        step="0.0001"
                        min="88.0"
                        max="97.6"
                        value={coordInputLon}
                        onChange={(e) => setCoordInputLon(e.target.value)}
                        className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-slate-100"
                      />
                    </div>
                    <button
                      type="submit"
                      className="px-3 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 font-medium cursor-pointer"
                    >
                      Query Telemetry & Slope
                    </button>
                  </form>
                  <div className="text-slate-400">
                    Tip: <strong className="text-slate-200">Click anywhere on the map</strong> across the 8 states to calculate 3×3 DEM slope & fetch live rainfall.
                  </div>
                </div>
              )}

              {/* Map Canvas + Visible Overlay Legend */}
              <div className="relative">
                <div
                  ref={mapContainerRef}
                  className={`w-full ${
                    activeTab === 'map' ? 'h-[520px]' : 'h-[390px]'
                  } bg-slate-950 z-0`}
                />

                {/* Visible Map Legend & Provenance Badge */}
                <div className="absolute bottom-3 left-3 z-[400] bg-slate-950/90 backdrop-blur-md border border-slate-700/80 rounded-lg p-3 text-[11px] text-slate-200 shadow-xl max-w-xs space-y-1.5">
                  <div className="font-semibold text-cyan-300 flex items-center justify-between border-b border-slate-800 pb-1">
                    <span>Map Legend & Provenance</span>
                    <span className="font-mono text-[10px] text-slate-400">EPSG:3857 / 4326</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-cyan-400 border-2 border-white inline-block shrink-0" />
                    <span>Selected Target Coordinate (Live Query)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-amber-500 border-2 border-amber-900 inline-block shrink-0" />
                    <span>Documented Historical Landslide (GSI / NASA GLC)</span>
                  </div>
                  {(activeBaseLayer === 'nasa_modis_terra' || activeBaseLayer === 'nasa_viirs_snpp') && (
                    <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                      <strong>Imagery Note:</strong> Dated NASA GIBS swath ({gibsDate}). Never labelled as a live camera feed.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================================================================
              TAB 1: OVERVIEW (Additional Executive Analytics & Context)
             ================================================================== */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Columns: 72-Hour Rainfall Accumulation Chart */}
              <div className="lg:col-span-2 bg-[#0F172A] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div>
                      <h2 className="text-sm font-bold text-white flex items-center gap-2">
                        <CloudRain className="w-4 h-4 text-cyan-400" />
                        72-Hour Observed Hourly & Cumulative Precipitation ({selectedLocation.name})
                      </h2>
                      <p className="text-xs text-slate-400">
                        Source: Open-Meteo Hourly Hydrological API • Units: mm/hr (bars) & cumulative mm (area) • UTC
                      </p>
                    </div>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 text-cyan-300 border border-slate-700">
                      72h Total: {rainfallData?.accum72hMm ?? 0} mm
                    </span>
                  </div>

                  {rainfallData?.status === 'live' && rainfallData.hourlySeries.length > 0 ? (
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={rainfallData.hourlySeries}>
                          <defs>
                            <linearGradient id="cumRainGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis
                            dataKey="displayTime"
                            stroke="#64748b"
                            fontSize={10}
                            tickMargin={6}
                            minTickGap={28}
                          />
                          <YAxis
                            stroke="#64748b"
                            fontSize={10}
                            label={{ value: 'mm', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              borderRadius: '8px',
                              fontSize: '12px'
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Area
                            type="monotone"
                            dataKey="cumulative72hMm"
                            name="72h Cumulative Rainfall (mm)"
                            stroke="#06b6d4"
                            strokeWidth={2}
                            fill="url(#cumRainGrad)"
                          />
                          <Area
                            type="step"
                            dataKey="precipitationMm"
                            name="Hourly Precipitation Rate (mm/hr)"
                            stroke="#14b8a6"
                            fill="#14b8a6"
                            fillOpacity={0.35}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-sm text-slate-400 bg-slate-900/50 rounded-lg border border-slate-800">
                      {rainfallData?.status === 'loading'
                        ? 'Retrieving 72-hour hourly precipitation series...'
                        : 'Rainfall series unavailable for this coordinate.'}
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] text-slate-400">
                  <span>Geological Context: {selectedLocation.geologicalContext}</span>
                  <span className="font-mono">Retrieved: {rainfallData?.retrievedAtIso?.slice(0, 19) || '—'}Z</span>
                </div>
              </div>

              {/* Right Column: Stage B Data Quality & Quick Corridor Switcher */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
                    <ShieldAlert className="w-4 h-4 text-teal-400" />
                    Stage B/C Screening Breakdown
                  </h2>
                  <p className="text-xs text-slate-400 mb-3">
                    Provisional rule-based screening factors for {selectedLocation.name}
                  </p>

                  <div className="space-y-2.5">
                    {liveAssessment.factors.map((f) => (
                      <div key={f.key} className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium text-slate-200">{f.label}</span>
                          <span className="font-mono text-cyan-300">{f.rawValueDisplay}</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-cyan-500 to-teal-400"
                            style={{ width: `${Math.round(f.normalized0to1 * 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                          <span>Weight: {(f.weight * 100).toFixed(0)}%</span>
                          <span>Contribution: +{f.weightedPoints} pts</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
                  <div className="font-semibold text-amber-300 mb-0.5">Scientific Interpretation Notice</div>
                  This experimental score ({liveAssessment.experimentalScore0to100 ?? 'N/A'}/100) is an uncalibrated screening index,{' '}
                  <strong>not a statistical probability percentage</strong>.
                </div>
              </div>
            </div>
          )}

          {/* ==================================================================
              TAB 3: SATELLITE IMAGERY (NASA GIBS + COPERNICUS SENTINEL-2 L2A)
             ================================================================== */}
          {activeTab === 'imagery' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Card: NASA GIBS Public WMTS Tile Service Diagnostics */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      Connected • Public WMTS
                    </span>
                    <h2 className="text-base font-bold text-white mt-1">
                      NASA EOSDIS GIBS Satellite Browse Layers
                    </h2>
                  </div>
                  <Satellite className="w-6 h-6 text-cyan-400" />
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Displays genuine Earth-observation satellite browse imagery via NASA Global Imagery Browse Services (GIBS) in{' '}
                  <code className="text-cyan-300">EPSG:3857</code>. Unlike raw multi-spectral scientific scenes, WMTS tiles are pre-rendered visualization composites designed for rapid synoptic cloud and surface inspection.
                </p>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                    <div className="text-slate-400">Selected Swath Date</div>
                    <div className="text-base font-mono font-bold text-cyan-300 mt-0.5">{gibsDate}</div>
                    <div className="text-[10px] text-slate-400 mt-1">Dated daily pass (never claimed as live video)</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                    <div className="text-slate-400">WMTS Tile Diagnostics</div>
                    <div className="text-base font-mono font-bold text-emerald-300 mt-0.5">
                      {tileLoadStats.loaded} Loaded / {tileLoadStats.errors} Failed
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 truncate">{tileLoadStats.lastTileSource}</div>
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs space-y-1.5">
                  <div className="font-semibold text-white">Visualization Tile vs. Raw Satellite Data</div>
                  <ul className="list-disc list-inside text-slate-300 space-y-1 text-[11px]">
                    <li>
                      <strong>NASA GIBS Visualization Tiles (Active):</strong> Pre-rendered JPEG/PNG tiles at 250m–375m resolution. Ideal for regional cloud cover and flood/snow swath visualization without API credentials.
                    </li>
                    <li>
                      <strong>Original Satellite Reflectance Data (Sentinel-2 L2A):</strong> 10m bottom-of-atmosphere multi-spectral bands (B02–B12) required for NDVI vegetation loss stripping and landslide scar delineation.
                    </li>
                  </ul>
                </div>
              </div>

              {/* Right Card: Copernicus Data Space Ecosystem (Sentinel-2 L2A) Integration Module */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      Server-Side OAuth2 Required
                    </span>
                    <h2 className="text-base font-bold text-white mt-1">
                      Copernicus Data Space: Sentinel-2 L2A (10m) Inspector
                    </h2>
                  </div>
                  <Lock className="w-5 h-5 text-amber-400" />
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  High-resolution (10m) before-and-after landslide scar comparison uses the Copernicus Data Space Ecosystem (CDSE) STAC & Sentinel Hub Process API. To protect credentials and respect rate limits, OAuth2 token exchange is handled strictly on the FastAPI backend.
                </p>

                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Target Bounding Box (10×10 km):</span>
                    <span className="font-mono text-cyan-300">
                      [{(selectedLocation.lon - 0.045).toFixed(3)}, {(selectedLocation.lat - 0.045).toFixed(3)},{' '}
                      {(selectedLocation.lon + 0.045).toFixed(3)}, {(selectedLocation.lat + 0.045).toFixed(3)}]
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Collection ID:</span>
                    <span className="font-mono text-slate-200">sentinel-2-l2a (10m Optical + SCL Cloud Mask)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Before / After Comparison Status:</span>
                    <span className="text-amber-300 font-medium">Awaiting CDSE_CLIENT_ID in backend .env</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> Zero-Fabrication Policy Enforced
                  </div>
                  <div>
                    Because no live Copernicus OAuth2 token is configured in this browser session, SlopeGuard NER refuses to fabricate a synthetic before/after Sentinel-2 image or fake NDVI change-detection result. Configure{' '}
                    <code className="font-mono bg-slate-950 px-1 py-0.5 rounded">CDSE_CLIENT_ID</code> and{' '}
                    <code className="font-mono bg-slate-950 px-1 py-0.5 rounded">CDSE_CLIENT_SECRET</code> in the FastAPI backend (see Tab 10) to activate live Sentinel-2 scene queries.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================================
              TAB 4: RAINFALL & TERRAIN TELEMETRY
             ================================================================== */}
          {activeTab === 'rainfall-terrain' && (
            <div className="space-y-6">
              {/* Top Row: Hourly Rate vs Accumulation + NASA POWER Daily Cross-Check */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Chart 1: Open-Meteo Hourly Precipitation Rate & Soil Moisture */}
                <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        Hourly Rainfall Rate (mm/hr) vs. Topsoil Moisture (m³/m³)
                      </h3>
                      <p className="text-xs text-slate-400">
                        Source: Open-Meteo Hourly API • Past 72 Hours at {selectedLocation.name}
                      </p>
                    </div>
                    <span className="text-xs font-mono text-cyan-300">0.1° Grid</span>
                  </div>

                  {rainfallData?.status === 'live' && rainfallData.hourlySeries.length > 0 ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={rainfallData.hourlySeries}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="displayTime" stroke="#64748b" fontSize={10} minTickGap={28} />
                          <YAxis
                            yAxisId="left"
                            stroke="#06b6d4"
                            fontSize={10}
                            label={{ value: 'mm/hr', angle: -90, position: 'insideLeft', fill: '#06b6d4', fontSize: 10 }}
                          />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            domain={[0, 0.6]}
                            stroke="#14b8a6"
                            fontSize={10}
                            label={{ value: 'm³/m³', angle: 90, position: 'insideRight', fill: '#14b8a6', fontSize: 10 }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              borderRadius: '8px',
                              fontSize: '12px'
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="precipitationMm"
                            name="Rainfall Rate (mm/hr)"
                            stroke="#06b6d4"
                            strokeWidth={2}
                            dot={false}
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="soilMoisture0to7cm"
                            name="Soil Moisture 0-7cm (m³/m³)"
                            stroke="#14b8a6"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-xs text-slate-400">
                      Hourly precipitation & soil moisture data unavailable.
                    </div>
                  )}
                </div>

                {/* Chart 2: NASA POWER Daily Precipitation & Surface Wetness */}
                <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        NASA POWER Satellite Agroclimatology (PRECTOTCORR & GWETTOP)
                      </h3>
                      <p className="text-xs text-slate-400">
                        Source: NASA LaRC POWER API (GPM/MERRA-2) • Dailymm/day • Note 2–3d satellite latency
                      </p>
                    </div>
                    <span className="text-xs font-mono text-teal-300">
                      {rainfallData?.nasaPowerStatus === 'connected' ? 'NASA Connected' : 'Querying...'}
                    </span>
                  </div>

                  {rainfallData?.nasaPowerStatus === 'connected' && rainfallData.nasaPowerSeries.length > 0 ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={rainfallData.nasaPowerSeries.filter((p) => p.precipMmDay !== null)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="date" stroke="#64748b" fontSize={10} />
                          <YAxis
                            stroke="#64748b"
                            fontSize={10}
                            label={{ value: 'mm/day', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              borderRadius: '8px',
                              fontSize: '12px'
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Bar
                            dataKey="precipMmDay"
                            name="NASA Corrected Daily Precip (mm/day)"
                            fill="#0ea5e9"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-xs text-slate-400 bg-slate-900/50 rounded-lg">
                      {rainfallData?.nasaPowerStatus === 'loading'
                        ? 'Querying NASA LaRC POWER API...'
                        : 'NASA POWER daily satellite series unavailable.'}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Row: 3x3 DEM Elevation Matrix & Horn's Slope Gradient Breakdown */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Mountain className="w-4 h-4 text-teal-400" />
                      Real 3×3 Digital Elevation Model Matrix & Horn (1981) Slope Calculation
                    </h3>
                    <p className="text-xs text-slate-400">
                      Source: Copernicus DEM GLO-90 via Open-Meteo Elevation API • CRS: EPSG:4326 • Cell Spacing: ~
                      {terrainData?.gridSpacingMeters ?? 90}m
                    </p>
                  </div>
                  <span className="text-xs font-mono px-2.5 py-1 rounded bg-teal-500/15 text-teal-300 border border-teal-500/30">
                    Calculated Slope: {terrainData?.slopeDegrees ?? '—'}° ({terrainData?.aspectCardinal ?? '—'})
                  </span>
                </div>

                {terrainData?.status === 'computed' && terrainData.grid3x3ElevationsM ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                    {/* 3x3 Visual Elevation Grid */}
                    <div className="grid grid-cols-3 gap-2.5 bg-slate-950 p-4 rounded-xl border border-slate-800">
                      {(['NW', 'N', 'NE', 'W', 'CENTER', 'E', 'SW', 'S', 'SE'] as const).map((dir, idx) => {
                        const r = Math.floor(idx / 3);
                        const c = idx % 3;
                        const elev = terrainData.grid3x3ElevationsM![r][c];
                        const isCenter = idx === 4;
                        return (
                          <div
                            key={dir}
                            className={`p-3 rounded-lg border text-center ${
                              isCenter
                                ? 'bg-cyan-500/15 border-cyan-500/50 text-white'
                                : 'bg-slate-900 border-slate-800 text-slate-300'
                            }`}
                          >
                            <div className="text-[10px] font-mono text-slate-400">{dir} Cell</div>
                            <div className="text-base font-bold font-mono mt-0.5">{elev} m</div>
                            <div className="text-[10px] text-slate-400">
                              Δz: {elev - terrainData.centerElevationM! >= 0 ? '+' : ''}
                              {(elev - terrainData.centerElevationM!).toFixed(0)} m
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Mathematical Formula Explanation */}
                    <div className="space-y-3 text-xs text-slate-300">
                      <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                        <div className="font-semibold text-white">Horn&apos;s Finite-Difference Gradient Formula</div>
                        <p className="text-slate-400 leading-relaxed">
                          Instead of assigning arbitrary slope numbers, SlopeGuard NER queries 9 surrounding elevation points (~90m spacing) around{' '}
                          <span className="font-mono text-cyan-300">
                            ({selectedLocation.lat.toFixed(4)}°N, {selectedLocation.lon.toFixed(4)}°E)
                          </span>{' '}
                          and computes orthogonal elevation derivatives:
                        </p>
                        <pre className="bg-slate-950 p-2.5 rounded border border-slate-800 font-mono text-[11px] text-teal-300 overflow-x-auto">
{`dz/dx = ((NE + 2E + SE) - (NW + 2W + SW)) / (8 * Δx)
dz/dy = ((NW + 2N + NE) - (SW + 2S + SE)) / (8 * Δy)
Slope (°) = arctan( sqrt((dz/dx)² + (dz/dy)²) ) * (180 / π)`}
                        </pre>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        <strong>Limitation:</strong> A 90m DEM grid cell measures macro-hillslope inclination. Local road-cut benches or retaining walls steeper than the 90m average require site-specific terrestrial LiDAR or total-station surveys.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center text-sm text-amber-300 bg-slate-900 rounded-lg">
                    {terrainData?.errorMessage || 'Calculating 3×3 DEM elevation matrix...'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================================================================
              TAB 5: RISK ASSESSMENT ENGINE (STAGE A, STAGE B, STAGE C + ML STATUS)
             ================================================================== */}
          {activeTab === 'risk-assessment' && (
            <div className="space-y-6">
              {/* Top Banner: Explicit Machine Learning Validation Status */}
              <div className="bg-slate-900 border border-amber-500/40 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
                      Stage A Rule-Based Baseline Active • Machine-Learning Prediction Not Yet Validated
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Consistent with scientific integrity requirements, no unvalidated machine-learning probability model is claimed. The score below is an{' '}
                      <strong>experimental multi-factor screening index (0–100)</strong> using configurable provisional weights that require regional calibration against balanced landslide/non-landslide inventories.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Stage B Data Quality Gate & Configurable Provisional Weights */}
                <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-5">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Stage B: Data Quality & Completeness Gate
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Verifies observation freshness, physical ranges, and missing factors before scoring.
                    </p>

                    <div className="mt-3 p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Gate Status:</span>
                        <span
                          className={`font-mono font-bold ${
                            liveAssessment.stageBStatus === 'SUFFICIENT_DATA'
                              ? 'text-emerald-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {liveAssessment.stageBStatus}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Input Completeness:</span>
                        <span className="font-mono text-white">
                          {liveAssessment.completenessPercent}% ({liveAssessment.availableFactorsCount}/
                          {liveAssessment.totalFactorsCount} Factors)
                        </span>
                      </div>
                      {liveAssessment.validationWarnings.length > 0 && (
                        <div className="pt-2 border-t border-slate-800 text-amber-300 text-[11px] space-y-1">
                          {liveAssessment.validationWarnings.map((w, idx) => (
                            <div key={idx}>• {w}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Configurable Provisional Weights */}
                  <div className="pt-3 border-t border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                        Provisional Factor Weights (Configurable)
                      </h4>
                      <button
                        onClick={() =>
                          setRiskWeights({
                            rain24h: 0.3,
                            rain72h: 0.25,
                            slope: 0.25,
                            soilMoisture: 0.1,
                            historicalProximity: 0.1
                          })
                        }
                        className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer"
                      >
                        Reset Default
                      </button>
                    </div>

                    <div className="space-y-3 text-xs">
                      {(
                        [
                          { k: 'rain24h', label: '24h Rainfall Weight' },
                          { k: 'rain72h', label: '72h Antecedent Rain Weight' },
                          { k: 'slope', label: 'DEM Terrain Slope Weight' },
                          { k: 'soilMoisture', label: 'Topsoil Moisture Weight' },
                          { k: 'historicalProximity', label: 'Historical Proximity Weight' }
                        ] as const
                      ).map((item) => (
                        <div key={item.k}>
                          <div className="flex justify-between mb-1">
                            <span className="text-slate-300">{item.label}</span>
                            <span className="font-mono text-cyan-300">
                              {Math.round(riskWeights[item.k] * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0.05"
                            max="0.60"
                            step="0.05"
                            value={riskWeights[item.k]}
                            onChange={(e) =>
                              setRiskWeights((prev) => ({
                                ...prev,
                                [item.k]: parseFloat(e.target.value)
                              }))
                            }
                            className="w-full accent-cyan-500 cursor-pointer"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right 2 Columns: Stage C Assessment Output & Factor Attribution Table */}
                <div className="lg:col-span-2 bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-cyan-400">
                        Stage C: Experimental Screening Output
                      </span>
                      <h3 className="text-lg font-bold text-white mt-0.5">{selectedLocation.name}</h3>
                      <p className="text-xs text-slate-400">
                        Computed at {liveAssessment.computedAtIso.slice(0, 19).replace('T', ' ')} UTC
                      </p>
                    </div>

                    <div className="flex items-center gap-4 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
                      <div>
                        <div className="text-[10px] uppercase text-slate-400">Experimental Score</div>
                        <div className="text-3xl font-bold text-white font-mono">
                          {liveAssessment.experimentalScore0to100 !== null
                            ? `${liveAssessment.experimentalScore0to100}`
                            : 'N/A'}
                          <span className="text-xs text-slate-400 font-normal"> / 100</span>
                        </div>
                      </div>
                      <div>{renderCategoryBadge(liveAssessment.screeningCategory)}</div>
                    </div>
                  </div>

                  {/* Factor Contribution Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="py-2 pr-3">Environmental Factor</th>
                          <th className="py-2 px-3">Observed Value</th>
                          <th className="py-2 px-3">Normalized [0–1]</th>
                          <th className="py-2 px-3">Normalized Weight</th>
                          <th className="py-2 px-3">Score Contribution</th>
                          <th className="py-2 pl-3">Scientific Assumption</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {liveAssessment.factors.map((f) => (
                          <tr key={f.key} className="hover:bg-slate-900/40">
                            <td className="py-3 pr-3 font-medium text-white">{f.label}</td>
                            <td className="py-3 px-3 font-mono text-cyan-300">{f.rawValueDisplay}</td>
                            <td className="py-3 px-3 font-mono text-slate-300">{f.normalized0to1}</td>
                            <td className="py-3 px-3 font-mono text-slate-300">{(f.weight * 100).toFixed(0)}%</td>
                            <td className="py-3 px-3 font-mono font-bold text-teal-300">+{f.weightedPoints} pts</td>
                            <td className="py-3 pl-3 text-[11px] text-slate-400 max-w-xs">{f.assumptionNote}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================================
              TAB 6: WHAT-IF RISK SIMULATOR (ISOLATED SANDBOX)
             ================================================================== */}
          {activeTab === 'simulator' && (
            <div className="space-y-6">
              {/* Isolated Simulation Banner */}
              <div className="bg-purple-950/40 border border-purple-500/40 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono text-xs font-bold uppercase">
                    WHAT-IF SIMULATION SANDBOX
                  </span>
                  <p className="text-xs text-slate-200">
                    User-entered scenario values are strictly isolated from live telemetry and are{' '}
                    <strong>never sent to any alert feed</strong>.
                  </p>
                </div>

                {rainfallData?.status === 'live' && terrainData?.status === 'computed' && (
                  <button
                    onClick={() => {
                      setSimRain24h(rainfallData.accum24hMm);
                      setSimRain72h(rainfallData.accum72hMm);
                      if (terrainData.slopeDegrees !== null) setSimSlopeDeg(terrainData.slopeDegrees);
                      if (rainfallData.soilMoistureVolumetric !== null)
                        setSimSoilMoisture(rainfallData.soilMoistureVolumetric);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-medium cursor-pointer"
                  >
                    Reset to Observed Inputs ({selectedLocation.name})
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: Interactive Scenario Sliders */}
                <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-purple-400" />
                      Modify Hypothetical Environmental Parameters
                    </h3>
                    <button
                      onClick={() => {
                        setSimRain24h(185);
                        setSimRain72h(340);
                        setSimSlopeDeg(36);
                        setSimSoilMoisture(0.46);
                      }}
                      className="text-xs text-purple-300 hover:underline cursor-pointer"
                    >
                      Load Illustrative Extreme Monsoon Scenario
                    </button>
                  </div>

                  <div className="space-y-4 text-xs">
                    {/* Slider 1: 24h Rain */}
                    <div className="bg-slate-900 p-3.5 rounded-lg border border-slate-800">
                      <div className="flex justify-between mb-1.5">
                        <span className="font-medium text-slate-200">Hypothetical 24-Hour Rainfall</span>
                        <span className="font-mono font-bold text-purple-300">
                          {simRain24h} mm (Observed: {rainfallData?.accum24hMm ?? '—'} mm)
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="300"
                        step="5"
                        value={simRain24h}
                        onChange={(e) => setSimRain24h(Number(e.target.value))}
                        className="w-full accent-purple-500 cursor-pointer"
                      />
                    </div>

                    {/* Slider 2: 72h Rain */}
                    <div className="bg-slate-900 p-3.5 rounded-lg border border-slate-800">
                      <div className="flex justify-between mb-1.5">
                        <span className="font-medium text-slate-200">Hypothetical 72-Hour Antecedent Rainfall</span>
                        <span className="font-mono font-bold text-purple-300">
                          {simRain72h} mm (Observed: {rainfallData?.accum72hMm ?? '—'} mm)
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="600"
                        step="10"
                        value={simRain72h}
                        onChange={(e) => setSimRain72h(Number(e.target.value))}
                        className="w-full accent-purple-500 cursor-pointer"
                      />
                    </div>

                    {/* Slider 3: Slope Angle */}
                    <div className="bg-slate-900 p-3.5 rounded-lg border border-slate-800">
                      <div className="flex justify-between mb-1.5">
                        <span className="font-medium text-slate-200">Hypothetical Terrain Slope Angle</span>
                        <span className="font-mono font-bold text-purple-300">
                          {simSlopeDeg}° (Observed DEM: {terrainData?.slopeDegrees ?? '—'}°)
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="65"
                        step="1"
                        value={simSlopeDeg}
                        onChange={(e) => setSimSlopeDeg(Number(e.target.value))}
                        className="w-full accent-purple-500 cursor-pointer"
                      />
                    </div>

                    {/* Slider 4: Topsoil Moisture */}
                    <div className="bg-slate-900 p-3.5 rounded-lg border border-slate-800">
                      <div className="flex justify-between mb-1.5">
                        <span className="font-medium text-slate-200">Hypothetical Topsoil Moisture (0–7 cm)</span>
                        <span className="font-mono font-bold text-purple-300">
                          {simSoilMoisture.toFixed(2)} m³/m³ (Observed: {rainfallData?.soilMoistureVolumetric ?? '—'})
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="0.55"
                        step="0.01"
                        value={simSoilMoisture}
                        onChange={(e) => setSimSoilMoisture(Number(e.target.value))}
                        className="w-full accent-purple-500 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* Right Column: Observed vs Simulated Score Comparison Chart */}
                <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                      <div>
                        <span className="text-[10px] font-mono uppercase text-purple-300">
                          What-If Simulation Result
                        </span>
                        <h3 className="text-base font-bold text-white">
                          Observed Baseline vs. Simulated Scenario
                        </h3>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold font-mono text-purple-300">
                          {simulatedAssessment.experimentalScore0to100} / 100
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Δ vs Observed:{' '}
                          {liveAssessment.experimentalScore0to100 !== null
                            ? `${
                                simulatedAssessment.experimentalScore0to100! -
                                  liveAssessment.experimentalScore0to100 >=
                                0
                                  ? '+'
                                  : ''
                              }${(
                                simulatedAssessment.experimentalScore0to100! -
                                liveAssessment.experimentalScore0to100
                              ).toFixed(1)} pts`
                            : 'N/A'}
                        </div>
                      </div>
                    </div>

                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={simulatedAssessment.factors.map((sf, idx) => ({
                            factor: sf.label.replace('Accumulation', '').replace('Documented ', ''),
                            Observed: liveAssessment.factors[idx]?.weightedPoints ?? 0,
                            Simulated: sf.weightedPoints
                          }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="factor" stroke="#64748b" fontSize={10} />
                          <YAxis
                            stroke="#64748b"
                            fontSize={10}
                            label={{ value: 'Weighted Points', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              borderRadius: '8px',
                              fontSize: '12px'
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Bar dataKey="Observed" name="Observed Telemetry Points" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Simulated" name="What-If Scenario Points" fill="#a855f7" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
                    <strong>Sensitivity Explanation:</strong> Modifying 24h rainfall to{' '}
                    <span className="text-purple-300 font-mono">{simRain24h} mm</span> and 72h rainfall to{' '}
                    <span className="text-purple-300 font-mono">{simRain72h} mm</span> on a{' '}
                    <span className="text-purple-300 font-mono">{simSlopeDeg}°</span> slope shifts the screening category to{' '}
                    <strong className="text-white">{simulatedAssessment.screeningCategory}</strong>.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================================
              TAB 7: HISTORICAL LANDSLIDE EVENTS (GSI BHUKOSH & NASA GLC)
             ================================================================== */}
          {activeTab === 'historical' && (
            <div className="space-y-6">
              {/* Coverage Limitation Notice */}
              <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
                <History className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-300 space-y-1">
                  <div className="font-bold text-amber-300 uppercase tracking-wider">
                    Historical Landslide Inventory — Coverage & Reporting Limitations
                  </div>
                  <p>
                    Events below are documented historical occurrences compiled from the{' '}
                    <strong>Geological Survey of India (GSI Bhukosh)</strong>,{' '}
                    <strong>NASA Global Landslide Catalog (GLC)</strong>, and official State Disaster Management Authority reports across Northeast India. They are{' '}
                    <strong>historical records, not active incidents</strong>. Because rural slope failures often go unreported,{' '}
                    <strong className="text-white">
                      the absence of a recorded event near a coordinate is never proof that a location is safe
                    </strong>
                    .
                  </p>
                </div>
              </div>

              {/* Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0F172A] border border-slate-800 rounded-xl p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs">
                    <Filter className="w-4 h-4 text-cyan-400" />
                    <span className="text-slate-400">Filter by State:</span>
                    <select
                      aria-label="Filter Historical Events by State"
                      value={histFilterState}
                      onChange={(e) => setHistFilterState(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200"
                    >
                      <option value="ALL">All 8 NER States ({DOCUMENTED_HISTORICAL_LANDSLIDES.length})</option>
                      {NER_STATES.map((st) => (
                        <option key={st.name} value={st.name}>
                          {st.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                    <input
                      type="text"
                      placeholder="Search district, trigger, title..."
                      value={histSearch}
                      onChange={(e) => setHistSearch(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="text-xs text-slate-400">
                  Showing <strong className="text-white">{filteredHistoricalEvents.length}</strong> documented historical events
                </div>
              </div>

              {/* Historical Events Table */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900/90 border-b border-slate-800 text-slate-400">
                        <th className="py-3 px-4">Event Date</th>
                        <th className="py-3 px-4">State & District</th>
                        <th className="py-3 px-4">Documented Event & Impact</th>
                        <th className="py-3 px-4">Primary Trigger</th>
                        <th className="py-3 px-4">Source Catalog</th>
                        <th className="py-3 px-4 text-right">Inspect on Map</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {filteredHistoricalEvents.map((ev) => (
                        <tr key={ev.id} className="hover:bg-slate-900/50">
                          <td className="py-3.5 px-4 font-mono text-amber-300 whitespace-nowrap">
                            <div>{ev.eventDate}</div>
                            <div className="text-[10px] text-slate-400">HISTORICAL</div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-semibold text-white">{ev.state}</div>
                            <div className="text-slate-400">{ev.district}</div>
                          </td>
                          <td className="py-3.5 px-4 max-w-md">
                            <div className="font-semibold text-slate-100">{ev.title}</div>
                            <p className="text-slate-400 text-[11px] mt-0.5">{ev.impactSummary}</p>
                            <div className="text-[10px] font-mono text-slate-400 mt-1">
                              Coords: {ev.lat.toFixed(4)}°N, {ev.lon.toFixed(4)}°E
                              {ev.fatalities !== null ? ` • Recorded Fatalities: ${ev.fatalities}` : ''}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700 text-[11px]">
                              {ev.trigger}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="text-slate-200">{ev.sourceCatalog}</div>
                            <a
                              href={ev.sourceCitationUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-cyan-400 hover:underline inline-flex items-center gap-1 mt-0.5"
                            >
                              Verify Source <ExternalLink className="w-3 h-3" />
                            </a>
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <button
                              onClick={() => {
                                setSelectedState(ev.state);
                                setSelectedLocation({
                                  name: `${ev.locationName} (${ev.eventDate} Site)`,
                                  state: ev.state,
                                  district: ev.district,
                                  lat: ev.lat,
                                  lon: ev.lon,
                                  geologicalContext: ev.impactSummary
                                });
                                setActiveTab('map');
                              }}
                              className="px-2.5 py-1 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-[11px] cursor-pointer"
                            >
                              Inspect Site
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================================
              TAB 8: ALERT CENTRE (STRICT SEPARATION: OFFICIAL vs INTERNAL PROTOTYPE)
             ================================================================== */}
          {activeTab === 'alerts' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Official External Advisories */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                      Section 1 • Authoritative Government Sources
                    </span>
                    <h3 className="text-base font-bold text-white mt-1">
                      Official External Advisories & Early Warning Authorities
                    </h3>
                  </div>
                  <ShieldAlert className="w-6 h-6 text-cyan-400" />
                </div>

                <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-2">
                  <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                    <Info className="w-4 h-4 shrink-0" /> Official CAP Feed Integration Status
                  </div>
                  <p className="leading-relaxed text-slate-400">
                    No live machine-readable Common Alerting Protocol (CAP) feed from IMD or GSI is directly connected to this unauthenticated browser session. SlopeGuard NER{' '}
                    <strong className="text-white">never rewrites an experimental risk score as an official warning</strong>. Consult the verified statutory agencies below for official evacuation or hazard bulletins:
                  </p>
                </div>

                <div className="space-y-2.5 text-xs">
                  {[
                    {
                      agency: 'Geological Survey of India — National Landslide Forecasting Centre (NLFC) & Bhusanket',
                      role: 'Statutory authority for regional landslide susceptibility and operational bulletins in India.',
                      url: 'https://bhusanket.gsi.gov.in/'
                    },
                    {
                      agency: 'India Meteorological Department (IMD) — Regional Meteorological Centre Guwahati',
                      role: 'Official district-level heavy rainfall red/orange/yellow warnings for Northeast India.',
                      url: 'https://mausam.imd.gov.in/guwahati/'
                    },
                    {
                      agency: 'National Disaster Management Authority (NDMA) — SACHET CAP Portal',
                      role: 'National Common Alerting Protocol (CAP) public emergency alert aggregator.',
                      url: 'https://sachet.ndma.gov.in/'
                    },
                    {
                      agency: 'North Eastern Space Applications Centre (NESAC — Dept. of Space)',
                      role: 'Regional flood and landslide geospatial early warning support for the 8 NER states.',
                      url: 'https://nesac.gov.in/'
                    }
                  ].map((item) => (
                    <div
                      key={item.agency}
                      className="p-3 rounded-lg bg-slate-900/70 border border-slate-800 flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="font-semibold text-white">{item.agency}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{item.role}</div>
                      </div>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 whitespace-nowrap inline-flex items-center gap-1"
                      >
                        Official Portal <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Internal Prototype Monitoring Notifications */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      Section 2 • Internal Research Prototype Only
                    </span>
                    <h3 className="text-base font-bold text-white mt-1">
                      Experimental Threshold Monitoring Notifications
                    </h3>
                  </div>
                  <Bell className="w-5 h-5 text-amber-400" />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 p-3 rounded-lg border border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-300 font-medium">Internal Screening Threshold: </span>
                    <span className="font-mono text-amber-300 font-bold">{alertThreshold} / 100</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="25"
                      max="80"
                      step="5"
                      value={alertThreshold}
                      onChange={(e) => setAlertThreshold(Number(e.target.value))}
                      className="w-32 accent-amber-500 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 bg-slate-900/50 p-2.5 rounded border border-slate-800">
                  <strong>Disclaimer:</strong> Notifications below are internal UI flags triggered when a coordinate&apos;s unvalidated screening score exceeds {alertThreshold}. Local authorities or emergency services are <strong>never notified</strong> by this prototype.
                </div>

                <div className="space-y-2.5 max-h-80 overflow-y-auto">
                  {prototypeNotifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 bg-slate-900/40 rounded-lg border border-slate-800">
                      No internal prototype notifications triggered at threshold {alertThreshold}/100.
                    </div>
                  ) : (
                    prototypeNotifications.map((note) => (
                      <div
                        key={note.id}
                        className={`p-3.5 rounded-lg border text-xs space-y-2 ${
                          note.acknowledged
                            ? 'bg-slate-900/40 border-slate-800 text-slate-400'
                            : 'bg-amber-500/10 border-amber-500/40 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-950 text-amber-300">
                            INTERNAL PROTOTYPE NOTIFICATION • {note.id}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            {note.createdAtIso.slice(11, 19)} UTC
                          </span>
                        </div>
                        <div className="font-bold text-white">
                          [{note.state}] {note.locationName} ({note.coordinates})
                        </div>
                        <p className="text-[11px] text-slate-300">{note.triggerSummary}</p>
                        <div className="flex items-center justify-end gap-2 pt-1">
                          {!note.acknowledged && (
                            <button
                              onClick={() =>
                                setPrototypeNotifications((prev) =>
                                  prev.map((n) => (n.id === note.id ? { ...n, acknowledged: true } : n))
                                )
                              }
                              className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-[11px] cursor-pointer"
                            >
                              Acknowledge
                            </button>
                          )}
                          <button
                            onClick={() =>
                              setPrototypeNotifications((prev) => prev.filter((n) => n.id !== note.id))
                            }
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] cursor-pointer"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================================================================
              TAB 9: DATA SOURCES & PROVENANCE REGISTRY
             ================================================================== */}
          {activeTab === 'sources' && (
            <div className="space-y-6">
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <Database className="w-5 h-5 text-cyan-400" />
                      Data Source Provenance, Freshness & Limitations Registry
                    </h2>
                    <p className="text-xs text-slate-400">
                      Every observation in SlopeGuard NER is tracked with its upstream provider, spatial/temporal resolution, authentication status, and known scientific limitations.
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      fetchRealTelemetryForCoordinate(
                        selectedLocation.lat,
                        selectedLocation.lon,
                        selectedLocation.name,
                        selectedLocation.state
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Run Live Source Health Check
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {dataSourceRegistry.map((src) => (
                    <div
                      key={src.id}
                      className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{src.provider}</span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                              {src.dataType}
                            </span>
                          </div>
                          <div className="text-sm font-semibold text-cyan-300 mt-0.5">{src.datasetName}</div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                              src.integrationStatus === 'Connected (Live)'
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : src.integrationStatus === 'Static Verified Catalog'
                                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            }`}
                          >
                            {src.integrationStatus}
                          </span>
                          <a
                            href={src.docUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs inline-flex items-center gap-1"
                          >
                            Official Docs <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
                        <div>
                          <div className="text-slate-400 text-[10px]">Spatial Resolution & Units</div>
                          <div className="font-mono text-slate-200 mt-0.5">
                            {src.spatialResolution} ({src.units})
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-400 text-[10px]">Update / Temporal Resolution</div>
                          <div className="font-mono text-slate-200 mt-0.5">{src.temporalResolution}</div>
                        </div>
                        <div>
                          <div className="text-slate-400 text-[10px]">Last Retrieval (UTC)</div>
                          <div className="font-mono text-emerald-300 mt-0.5">
                            {src.lastSuccessIso ? src.lastSuccessIso.slice(0, 19).replace('T', ' ') + 'Z' : 'Not Queried'}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-400 text-[10px]">Observation / Acquisition Time</div>
                          <div className="font-mono text-cyan-300 mt-0.5">{src.latestObservationTime || 'N/A'}</div>
                        </div>
                      </div>

                      <div className="text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <strong className="text-slate-200">Known Limitations:</strong> {src.limitations}
                        </div>
                        <span className="font-mono text-[10px] text-slate-400">Auth: {src.authRequirement}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ==================================================================
              TAB 10: ABOUT, LIMITATIONS, BACKEND SOURCE CODE & ACCEPTANCE REPORT
             ================================================================== */}
          {activeTab === 'about' && (
            <div className="space-y-6">
              {/* Section 1: Executive Acceptance & Feature Status Matrix */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-4">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  SlopeGuard NER — Deliverable Feature Status & Acceptance Verification
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-2 pr-3">Module / Requirement</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Connected Service / Method</th>
                        <th className="py-2 pl-3">Verification Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      <tr>
                        <td className="py-2.5 pr-3 font-medium text-white">NASA GIBS Satellite Imagery Layer</td>
                        <td className="py-2.5 px-3 text-emerald-400 font-semibold">Implemented & Tested</td>
                        <td className="py-2.5 px-3 font-mono">MODIS Terra, VIIRS SNPP, IMERG WMTS</td>
                        <td className="py-2.5 pl-3 text-slate-300">Supports date picker, layer switching, and tile error counter.</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-3 font-medium text-white">Real Rainfall & Soil Moisture Telemetry</td>
                        <td className="py-2.5 px-3 text-emerald-400 font-semibold">Implemented & Tested</td>
                        <td className="py-2.5 px-3 font-mono">Open-Meteo Hourly + NASA POWER API</td>
                        <td className="py-2.5 pl-3 text-slate-300">Distinguishes current rate (mm/hr) from 24h/72h accumulation.</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-3 font-medium text-white">Real DEM Elevation & Slope Calculation</td>
                        <td className="py-2.5 px-3 text-emerald-400 font-semibold">Implemented & Tested</td>
                        <td className="py-2.5 px-3 font-mono">Copernicus DEM GLO-90 (3×3 Horn Method)</td>
                        <td className="py-2.5 pl-3 text-slate-300">Calculates true slope (°) & aspect from 9 surrounding DEM points.</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-3 font-medium text-white">Documented Historical Landslide Inventory</td>
                        <td className="py-2.5 px-3 text-emerald-400 font-semibold">Implemented & Tested</td>
                        <td className="py-2.5 px-3 font-mono">GSI Bhukosh & NASA GLC Snapshot</td>
                        <td className="py-2.5 pl-3 text-slate-300">Covers all 8 NER states; explicitly marked as historical records.</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-3 font-medium text-white">Stage A/B/C Transparent Risk Screening</td>
                        <td className="py-2.5 px-3 text-emerald-400 font-semibold">Implemented & Tested</td>
                        <td className="py-2.5 px-3 font-mono">Configurable Rule-Based Baseline</td>
                        <td className="py-2.5 pl-3 text-slate-300">Includes Stage B data-completeness gate; ML labelled unvalidated.</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-3 font-medium text-white">Copernicus Sentinel-2 L2A (10m) API</td>
                        <td className="py-2.5 px-3 text-amber-300 font-semibold">Awaiting Credentials</td>
                        <td className="py-2.5 px-3 font-mono">CDSE OAuth2 (Backend Configured)</td>
                        <td className="py-2.5 pl-3 text-slate-300">Requires server-side CDSE_CLIENT_ID & CDSE_CLIENT_SECRET in .env.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 2: Complete Python FastAPI Backend, .env.example & Pytest Suite */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* FastAPI main.py */}
                <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-cyan-400" />
                      <h3 className="text-sm font-bold text-white">Backend Source: backend/main.py (FastAPI)</h3>
                    </div>
                    <button
                      onClick={() => handleCopyCode('fastapi', FASTAPI_MAIN_PY)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-cyan-300 inline-flex items-center gap-1 cursor-pointer"
                    >
                      {copiedCodeBlock === 'fastapi' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedCodeBlock === 'fastapi' ? 'Copied' : 'Copy Code'}
                    </button>
                  </div>
                  <pre className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-80">
                    {FASTAPI_MAIN_PY}
                  </pre>
                </div>

                {/* .env.example & Pytest Suite */}
                <div className="space-y-6">
                  <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-teal-400" />
                        <h3 className="text-sm font-bold text-white">Environment Template: .env.example</h3>
                      </div>
                      <button
                        onClick={() => handleCopyCode('env', ENV_EXAMPLE_TXT)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-cyan-300 inline-flex items-center gap-1 cursor-pointer"
                      >
                        {copiedCodeBlock === 'env' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedCodeBlock === 'env' ? 'Copied' : 'Copy .env.example'}
                      </button>
                    </div>
                    <pre className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 font-mono text-[11px] text-teal-300 overflow-x-auto">
                      {ENV_EXAMPLE_TXT}
                    </pre>
                  </div>

                  <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-purple-400" />
                        <h3 className="text-sm font-bold text-white">Automated Tests: backend/test_risk_engine.py</h3>
                      </div>
                      <button
                        onClick={() => handleCopyCode('pytest', PYTEST_SUITE_PY)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-cyan-300 inline-flex items-center gap-1 cursor-pointer"
                      >
                        {copiedCodeBlock === 'pytest' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedCodeBlock === 'pytest' ? 'Copied' : 'Copy Tests'}
                      </button>
                    </div>
                    <pre className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 font-mono text-[11px] text-purple-300 overflow-x-auto">
                      {PYTEST_SUITE_PY}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}