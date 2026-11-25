/**
 * How a feature's position is known. Every card and hover callout shows this, so a permit record
 * or a line drawn by rule is never mistaken for a surveyed main.
 */
export type Confidence =
  'surveyed' | 'utility' | 'block-level' | 'lot-level' | 'crowdsourced' | 'inferred' | 'context';

export const CONFIDENCE_LABELS: Record<Confidence, { label: string; detail: string }> = {
  surveyed: {
    label: 'From city records',
    detail: 'Location published by the owning agency, typically accurate to within a few feet.',
  },
  utility: {
    label: 'From utility records',
    detail:
      'Location published by the utility that owns it, on its own public map. Cable routes between these points are not published.',
  },
  'block-level': {
    label: 'From permits',
    detail:
      'Excavation permits show the utility on this block, not its exact position in the street.',
  },
  'lot-level': {
    label: 'From lot records',
    detail:
      'Recorded per tax lot. The route is not published, so the line is drawn straight from the main to the lot.',
  },
  crowdsourced: {
    label: 'From OpenStreetMap',
    detail: 'Mapped by OpenStreetMap contributors from imagery or survey. Owner often unknown.',
  },
  inferred: {
    label: 'Inferred',
    detail: 'Not in any public record. Drawn from how these utilities are typically built.',
  },
  context: {
    label: 'Reference geometry',
    detail: 'Street and building outlines from NYC planimetric data.',
  },
};

export interface SourceInfo {
  id: string;
  name: string;
  publisher: string;
  url: string;
  confidence: Confidence;
  license: string;
}

const nycOpenData = (
  id: string,
  name: string,
  publisher: string,
  confidence: Confidence,
): SourceInfo => ({
  id,
  name,
  publisher,
  url: `https://data.cityofnewyork.us/d/${id}`,
  confidence,
  license: 'NYC Open Data, no restrictions on use (NYC Admin. Code §23-502(d))',
});

const DC_GIS = 'https://maps2.dcgis.dc.gov/dcgis/rest/services';

/** A DC GIS layer; `id` is its full query URL, which the nightly build reads. */
const dcGis = (
  layer: string,
  name: string,
  publisher: string,
  confidence: Confidence,
): SourceInfo => ({
  id: `${DC_GIS}/${layer}`,
  name,
  publisher,
  url: `${DC_GIS}/${layer}`,
  confidence,
  license: 'DC Open Data, CC BY 4.0',
});

/** A DataSF dataset; `id` is its Socrata id on data.sf.gov, which the nightly build reads. */
const dataSf = (
  id: string,
  name: string,
  publisher: string,
  confidence: Confidence,
): SourceInfo => ({
  id,
  name,
  publisher,
  url: `https://data.sf.gov/d/${id}`,
  confidence,
  license: 'DataSF, Public Domain Dedication and License (PDDL)',
});

/** A city ArcGIS layer; `id` is its full query URL. */
const cityLayer = (
  url: string,
  name: string,
  publisher: string,
  confidence: Confidence,
  license = 'City and County of San Francisco public map service; no open license stated',
): SourceInfo => ({ id: url, name, publisher, url, confidence, license });

const LA_HUB = 'https://maps.lacity.org/lahub/rest/services';
// StreetsLA's sidewalk inventory, which the Bureau of Engineering hosts on ArcGIS Online.
const LA_SIDEWALKS =
  'https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Sidewalks_Mapped_Areas/FeatureServer/6';

/** A City of Los Angeles layer on GeoHub; `id` is its full query URL. */
const laLayer = (layer: string, name: string, publisher: string, confidence: Confidence) =>
  cityLayer(
    `${LA_HUB}/${layer}`,
    name,
    publisher,
    confidence,
    'City of Los Angeles GeoHub; no open license stated',
  );

const SANGIS = 'https://geo.sandag.org/server/rest/services/Hosted';
const SD_MAPS = 'https://webmaps.sandiego.gov/arcgis/rest/services';

// SanGIS asks that its data, once reworked, be credited as derived from it.
const sanGisLayer = (layer: string, name: string, publisher: string, confidence: Confidence) =>
  cityLayer(
    `${SANGIS}/${layer}/FeatureServer/0`,
    name,
    publisher,
    confidence,
    'GIS data derived, modified, reduced, and/or processed from SanGIS downloadable data - www.sangis.org',
  );

// The city's open data portal publishes its permits as one CSV of every issued approval; both
// sets are cut from it, so `id` is the file and `url` the dataset's page.
const sdApprovals = (name: string): SourceInfo => ({
  id: 'https://seshat.datasd.org/development_permits/approvals_issued_datasd.csv',
  name,
  publisher: 'City of San Diego Development Services',
  url: 'https://data.sandiego.gov/datasets/development-permits/',
  confidence: 'block-level',
  license: 'City of San Diego open data (ODC-PDDL)',
});

const sdLayer = (layer: string, name: string, publisher: string, confidence: Confidence) =>
  cityLayer(
    `${SD_MAPS}/${layer}`,
    name,
    publisher,
    confidence,
    'City of San Diego map service; sandiego.gov terms, non-commercial use',
  );

const SEA_AGOL = 'https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services';

const seaLayer = (layer: string, name: string, publisher: string, confidence: Confidence) =>
  cityLayer(
    `${SEA_AGOL}/${layer}`,
    name,
    publisher,
    confidence,
    'City of Seattle open data; provided without warranty',
  );

const DEN_AGOL = 'https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services';

/** A City and County of Denver open data layer; `id` is its full query URL. */
const denLayer = (layer: string, name: string, publisher: string, confidence: Confidence) =>
  cityLayer(
    `${DEN_AGOL}/${layer}`,
    name,
    publisher,
    confidence,
    'City of Denver Open Data Catalog, CC BY 3.0; not for engineering purposes',
  );

/** A City of Chicago data portal dataset; `id` is its Socrata id, which the nightly build reads. */
const chicagoData = (
  id: string,
  name: string,
  publisher: string,
  confidence: Confidence,
): SourceInfo => ({
  id,
  name,
  publisher,
  url: `https://data.cityofchicago.org/d/${id}`,
  confidence,
  license: 'City of Chicago data portal terms of use; provided as is',
});

const DAL_AGOL = 'https://services2.arcgis.com/rwnOSbfKSwyTBcwN/arcgis/rest/services';
// The city's layers set no license and Dallas Open Data names none; credited to the city as
// published.
const DAL_LICENSE = 'City of Dallas open data; no license stated, provided as is';

/** A City of Dallas layer on its ArcGIS Online organization; `id` is its full query URL. */
const dalLayer = (layer: string, name: string, publisher: string, confidence: Confidence) =>
  cityLayer(`${DAL_AGOL}/${layer}`, name, publisher, confidence, DAL_LICENSE);

const SJ_GIS = 'https://geo.sanjoseca.gov/server/rest/services';
// The utility permits aren't in the city's open data catalog and their map service states no
// license; the city's open data layers are CC BY.
const SJ_PERMIT_LICENSE = 'City of San Jose map service; no license stated, provided as is';
const SJ_OPEN_LICENSE = 'City of San Jose open data, CC BY';

/** A City of San Jose open data layer (CC BY); `id` is its full query URL. */
const sjLayer = (layer: number, name: string, publisher: string, confidence: Confidence) =>
  cityLayer(
    `${SJ_GIS}/OPN/OPN_OpenDataService/MapServer/${layer}`,
    name,
    publisher,
    confidence,
    SJ_OPEN_LICENSE,
  );

/** One of the city's utility permit layers; `id` is its full query URL. */
const sjPermitLayer = (layer: number, name: string) =>
  cityLayer(
    `${SJ_GIS}/PLN/PLN_PermitsAndComplaints/MapServer/${layer}`,
    name,
    'City of San Jose Public Works',
    'block-level',
    SJ_PERMIT_LICENSE,
  );

const SF_SEWERS = 'https://gis.sf.gov/svc/rest/services/boe/SEWER_ASSETS_ALL_STATUS/FeatureServer';
const SF_AGOL = 'https://services.arcgis.com/Zs2aNLFN00jrS4gG/arcgis/rest/services';

export const SOURCES = {
  hydrants: nycOpenData('5bgh-vtsn', 'Citywide Hydrants', 'NYC DEP', 'surveyed'),
  catchBasins: nycOpenData('2w2g-fk3i', 'Citywide Catch Basins', 'NYC DEP', 'surveyed'),
  linkNyc: nycOpenData('s4kf-3yrf', 'LinkNYC Kiosk Locations', 'NYC OTI', 'surveyed'),
  permitsCurrent: nycOpenData(
    'tqtj-sjs8',
    'Street Construction Permits (2022 to present)',
    'NYC DOT',
    'block-level',
  ),
  permitsHistoric: nycOpenData(
    'c9sj-fmsg',
    'Street Construction Permits (2013 to 2021)',
    'NYC DOT',
    'block-level',
  ),
  curbs: nycOpenData('5xvt-8cbk', 'Planimetric Database: Curbs', 'NYC OTI', 'context'),
  roadbed: nycOpenData('i36f-5ih7', 'Planimetric Database: Roadbed', 'NYC OTI', 'context'),
  sidewalks: nycOpenData('52n9-sdep', 'Planimetric Database: Sidewalk', 'NYC OTI', 'context'),
  buildings: nycOpenData('5zhs-2jue', 'Building Footprints', 'NYC OTI', 'context'),
  serviceLines: nycOpenData(
    'jqfp-uff7',
    'Lead Service Line Location Coordinates',
    'NYC DEP',
    'lot-level',
  ),
  connectionPermits: nycOpenData('hphy-6g7m', 'Water and Sewer Permits', 'NYC DEP', 'lot-level'),
  connectionPermitsHistoric: nycOpenData(
    '4k4u-823g',
    'Water and Sewer Permits (Historic)',
    'NYC DEP',
    'lot-level',
  ),
  signalsLpi: nycOpenData(
    'xc4v-ntf4',
    'Leading Pedestrian Interval Signals',
    'NYC DOT',
    'surveyed',
  ),
  signalsAccessible: nycOpenData(
    'de3m-c5p4',
    'Accessible Pedestrian Signal Locations',
    'NYC DOT',
    'surveyed',
  ),
  signalsExclusive: nycOpenData(
    '8kuj-2n3u',
    'Exclusive Pedestrian Signal Locations',
    'NYC DOT',
    'surveyed',
  ),
  outfalls: nycOpenData('8rjn-kpsh', 'Citywide Outfalls', 'NYC DEP', 'surveyed'),
  elevations: nycOpenData(
    '9uxf-ng6q',
    'Planimetric Database: Elevation Points',
    'NYC OTI',
    'context',
  ),
  centerline: nycOpenData('inkn-q76z', 'Street Centerline (CSCL)', 'NYC OTI', 'context'),
  // Washington, DC: DC GIS and DC Water ArcGIS layers, read by the nightly build.
  dcPermits: dcGis(
    'DDOT/TOPS/MapServer/0',
    'Public Space Construction Permits (TOPS)',
    'DDOT',
    'block-level',
  ),
  dcBlocks: dcGis(
    'DCGIS_DATA/Transportation_WebMercator/MapServer/163',
    'Roadway Blocks',
    'DDOT',
    'context',
  ),
  dcCurbs: dcGis('DCGIS_DATA/Transportation_WebMercator/MapServer/115', 'Curbs', 'OCTO', 'context'),
  dcSidewalks: dcGis(
    'DCGIS_DATA/Transportation_WebMercator/MapServer/83',
    'Sidewalks',
    'OCTO',
    'context',
  ),
  dcRoads: dcGis('DCGIS_DATA/Transportation_WebMercator/MapServer/61', 'Roads', 'OCTO', 'context'),
  dcBuildings: dcGis(
    'DCGIS_DATA/Facility_and_Structure_WebMercator/MapServer/1',
    'Building Footprints',
    'OCTO',
    'context',
  ),
  dcElevations: dcGis(
    'DCGIS_DATA/Elevation_WebMercator/MapServer/1',
    'Spot Elevations',
    'OCTO',
    'context',
  ),
  dcHydrants: dcGis(
    'DCGIS_DATA/Public_Safety_WebMercator/MapServer/5',
    'Fire Hydrants',
    'DC Water',
    'surveyed',
  ),
  dcInlets: dcGis(
    'DCGIS_DATA/Facility_and_Structure_WebMercator/MapServer/5',
    'Grates (storm inlets)',
    'OCTO',
    'surveyed',
  ),
  dcOutfalls: dcGis(
    'DCGIS_DATA/Environment_Stormwater_Management_WebMercator/MapServer/68',
    'MS4 Outfalls',
    'DOEE',
    'surveyed',
  ),
  dcLights: dcGis('DDOT/Streetlights/MapServer/0', 'Streetlights', 'DDOT', 'surveyed'),
  dcSignals: dcGis('DDOT/DdotAssets/MapServer/5', 'Traffic Signals', 'DDOT', 'surveyed'),
  // Only each lot's square-suffix-lot number and outline are read, never the owner fields.
  dcLots: dcGis(
    'DCGIS_DATA/Property_and_Land_WebMercator/MapServer/40',
    'Owner Polygons (Common Ownership Layer)',
    'OTR',
    'context',
  ),
  dcMains: {
    id: 'https://geo.dcwater.com/arcgis/rest/services/Viewer/DWS16inLargeMain/MapServer/4',
    name: 'Water Main (16" & Larger)',
    publisher: 'DC Water',
    url: 'https://geo.dcwater.com/arcgis/rest/services/Viewer/DWS16inLargeMain/MapServer/4',
    confidence: 'utility',
    license: 'DC Water public map service; not for commercial, legal or other use',
  },
  dcServiceLines: {
    id: 'https://geo.dcwater.com/arcgis/rest/services/Public/WaterServiceInfo_new/MapServer/0',
    name: 'Water Service Information',
    publisher: 'DC Water',
    url: 'https://geo.dcwater.com/Lead/',
    confidence: 'lot-level',
    license: 'DC Water public map service; not for commercial, legal or other use',
  },
  // San Francisco: DataSF on data.sf.gov and the city's ArcGIS layers, read by the nightly build.
  sfPermits: dataSf(
    'b6tj-gt35',
    'Street-Use Permits (excavation)',
    'SF Public Works',
    'block-level',
  ),
  sfStreets: dataSf('3psu-pn9h', 'Streets, Active and Retired', 'SF Public Works', 'context'),
  sfNodes: dataSf('vd6w-dq8r', 'Street Nodes', 'SF Public Works', 'context'),
  sfCurbs: dataSf('emxt-b6yg', 'Curbs and Islands', 'SF Public Works', 'context'),
  sfRoads: dataSf('h8n7-e4ns', 'Right of Way Polygons', 'SF Public Works', 'context'),
  sfBuildings: dataSf('ynuv-fyni', 'Building Footprints', 'DataSF', 'context'),
  sfSignals: dataSf('ybh5-27n2', 'Traffic Signals', 'SFMTA', 'surveyed'),
  sfSewerNodes: cityLayer(
    `${SF_SEWERS}/0`,
    'Sewer nodes (manholes, catch basins, outfalls)',
    'SF Public Works, Bureau of Engineering',
    'surveyed',
  ),
  sfSewerMains: cityLayer(
    `${SF_SEWERS}/2`,
    'Sewer mains',
    'SF Public Works, Bureau of Engineering',
    'surveyed',
  ),
  sfSideSewers: cityLayer(
    `${SF_SEWERS}/1`,
    'Side sewers',
    'SF Public Works, Bureau of Engineering',
    'surveyed',
  ),
  sfHydrantsHigh: cityLayer(
    `${SF_AGOL}/Firefighting_ESF_4/FeatureServer/3`,
    'High pressure hydrants (AWSS), 2018',
    'SF Department of Emergency Management',
    'surveyed',
  ),
  sfHydrantsLow: cityLayer(
    `${SF_AGOL}/Firefighting_ESF_4/FeatureServer/4`,
    'Low pressure hydrants, 2018',
    'SF Department of Emergency Management',
    'surveyed',
  ),
  sfLights: cityLayer(
    `${SF_AGOL}/SFPUC_Streetlights/FeatureServer/0`,
    'Streetlights',
    'SFPUC',
    'surveyed',
  ),
  // Los Angeles: the city's GeoHub layers, read by the nightly build.
  laPermitsActive: laLayer(
    'Public_Way_Reservations/MapServer/3',
    'Excavation (U) permits, active',
    'LA Bureau of Engineering',
    'block-level',
  ),
  laPermitsArchived: laLayer(
    'Public_Way_Reservations/MapServer/7',
    'Excavation (U) permits',
    'LA Bureau of Engineering',
    'block-level',
  ),
  laPermitsPoints: laLayer(
    'Public_Way_Reservations/MapServer/5',
    'Excavation (U) permits, archived points',
    'LA Bureau of Engineering',
    'block-level',
  ),
  laPermitsLines: laLayer(
    'Public_Way_Reservations/MapServer/6',
    'Excavation (U) permits, archived lines',
    'LA Bureau of Engineering',
    'block-level',
  ),
  laStreets: laLayer(
    'Street_Information/MapServer/36',
    'Street Centerline',
    'LA Bureau of Engineering',
    'context',
  ),
  laBuildings: laLayer(
    'Landbase_Information/MapServer/9',
    'Building Footprints (LARIAC)',
    'LA County and City of LA',
    'context',
  ),
  laHydrants: laLayer('Fire_Department/MapServer/0', 'Fire Hydrants', 'LAFD', 'surveyed'),
  laInlets: laLayer(
    'Stormwater_Information/MapServer/8',
    'Catch Basins',
    'LA Sanitation',
    'surveyed',
  ),
  laSewerStructures: laLayer(
    'Sewer_Information/MapServer/0',
    'Sewer Maintenance Holes',
    'LA Sanitation',
    'surveyed',
  ),
  laSewers: laLayer('Sewer_Information/MapServer/9', 'Sewer Pipes', 'LA Sanitation', 'surveyed'),
  laSideSewers: laLayer(
    'Sewer_Information/MapServer/6',
    'Sewer Laterals',
    'LA Sanitation',
    'surveyed',
  ),
  laStormDrains: laLayer(
    'Stormwater_Information/MapServer/10',
    'Storm Pipes',
    'LA Sanitation',
    'surveyed',
  ),
  laSidewalks: cityLayer(
    LA_SIDEWALKS,
    'Sidewalks (Mapped Areas)',
    'StreetsLA',
    'context',
    'City of Los Angeles GeoHub; no open license stated',
  ),
  laLights: laLayer(
    'Bureau_of_Street_Lighting/MapServer/0',
    'Streetlights',
    'LA Bureau of Street Lighting',
    'surveyed',
  ),
  laSignals: laLayer('LADOT/MapServer/30', 'Traffic Signals', 'LADOT', 'surveyed'),
  sdPermits: sdApprovals('Right of way permits (Accela, 2021 on)'),
  sdPermitsOld: sdApprovals('Right of way permits (PTS, before 2021)'),
  sdStreets: sanGisLayer('Roads_All', 'Road segments', 'SanGIS', 'context'),
  sdBuildings: sanGisLayer('Building_Outlines', 'Building outlines', 'SanGIS', 'context'),
  sdSewerManholes: sanGisLayer(
    'Sewer_Manhole_SD',
    'Sewer manholes',
    'City of San Diego Public Utilities',
    'surveyed',
  ),
  sdSewers: sanGisLayer(
    'Sewer_Main_SD',
    'Sewer mains',
    'City of San Diego Public Utilities',
    'surveyed',
  ),
  sdWaterMains: sanGisLayer(
    'Water_Main_SD',
    'Water mains',
    'City of San Diego Public Utilities',
    'surveyed',
  ),
  sdHydrants: sanGisLayer(
    'Water_Hydrants_SD',
    'Fire hydrants',
    'City of San Diego Public Utilities',
    'surveyed',
  ),
  sdInlets: sanGisLayer(
    'Drain_Structure',
    'Storm drain structures',
    'City of San Diego Stormwater',
    'surveyed',
  ),
  sdStormDrains: sanGisLayer(
    'Drain_Conveyance',
    'Storm drain conveyances',
    'City of San Diego Stormwater',
    'surveyed',
  ),
  sdRecycledMains: sanGisLayer(
    'Recycled_Water_Main',
    'Recycled water mains',
    'City of San Diego Public Utilities',
    'surveyed',
  ),
  // Hosted for the city by its consultant. Only location, material and how it's known are read,
  // never the account, meter or notes fields.
  sdServiceLines: {
    id: 'https://services1.arcgis.com/EFYIRUToGCsM2IHN/arcgis/rest/services/COSD_Lead_Service_Line_Inventory_Public/FeatureServer/0',
    name: 'Lead Service Line Inventory',
    publisher: 'City of San Diego Public Utilities',
    url: 'https://services1.arcgis.com/EFYIRUToGCsM2IHN/arcgis/rest/services/COSD_Lead_Service_Line_Inventory_Public/FeatureServer/0',
    confidence: 'lot-level',
    license: 'City of San Diego public inventory; reproduction and distribution prohibited',
  },
  sdLights: sdLayer(
    'Planning/PLN_Mobility/MapServer/1',
    'Street lights',
    'City of San Diego Transportation',
    'surveyed',
  ),
  sdSignals: sdLayer(
    'Planning/PLN_Mobility/MapServer/0',
    'Traffic signals',
    'City of San Diego Transportation',
    'surveyed',
  ),
  seaPermits: seaLayer(
    'SU_Permit_Data_Model_Relationships/FeatureServer/2',
    'Street Use utility permits',
    'Seattle Department of Transportation',
    'block-level',
  ),
  seaStreets: seaLayer('Seattle_Streets_1/FeatureServer/0', 'Street segments', 'SDOT', 'context'),
  seaBuildings: seaLayer(
    'Building_Outlines_2023/FeatureServer/0',
    'Building outlines, 2023',
    'City of Seattle',
    'context',
  ),
  seaSewers: seaLayer(
    'SPU_DWW_Mainlines_External/FeatureServer/10',
    'Sewer and drainage mainlines',
    'Seattle Public Utilities',
    'surveyed',
  ),
  seaSewerHoles: seaLayer(
    'SPU_DWW_Mainline_Points_External/FeatureServer/1',
    'Sewer maintenance holes',
    'Seattle Public Utilities',
    'surveyed',
  ),
  // SPU publishes only its distribution mains, none wider than 10 in; the transmission
  // mains that feed them are left out of the public layer.
  seaWaterMains: seaLayer(
    'SPU_Water_Mains_and_Services/FeatureServer/1',
    'Water Distribution Mains (10" & Smaller)',
    'Seattle Public Utilities',
    'surveyed',
  ),
  // The layer behind SPU's own "research your water service line" map: the material of SPU's
  // part of each service, main to meter and meter to union. Only location, material, size and
  // year are read, never the meter, premise, account or comment fields.
  seaServiceLines: seaLayer(
    'SPU_Water_Mains_and_Services/FeatureServer/8',
    'Water services',
    'Seattle Public Utilities',
    'lot-level',
  ),
  seaSideSewers: seaLayer(
    'SPU_DWW_Non-Mainlines_Internal_view/FeatureServer/2',
    'Side sewers (non-SPU owned non-mainlines)',
    'Seattle Public Utilities',
    'surveyed',
  ),
  // Generalized by City Light for public use, "for planning purposes only".
  seaElectricLines: seaLayer(
    'SCL_Lines/FeatureServer/2',
    'Electrical lines, generalized',
    'Seattle City Light',
    'surveyed',
  ),
  seaElectricStructures: seaLayer(
    'SCL_Structures/FeatureServer/0',
    'Underground electrical structures, generalized',
    'Seattle City Light',
    'utility',
  ),
  seaCatchBasins: seaLayer(
    'SPU_DWW_Catch_Basins_Inlets_Junction_Boxes_Sandboxes_and_Trash_Racks/FeatureServer/2',
    'Catch basins',
    'Seattle Public Utilities',
    'surveyed',
  ),
  seaLights: seaLayer(
    'Seattle_City_Light_Poles_PROD/FeatureServer/1',
    'Street light poles',
    'Seattle City Light',
    'surveyed',
  ),
  seaSignals: seaLayer(
    'Traffic_Signal_Assemblies_(Active)/FeatureServer/0',
    'Traffic signals',
    'SDOT',
    'surveyed',
  ),
  denPermits: denLayer(
    'ODC_DEV_STREETOCCUPANCYPPERMITS_L/FeatureServer/297',
    'Street occupancy permits',
    'Denver Department of Transportation and Infrastructure',
    'block-level',
  ),
  denStreets: denLayer(
    'ODC_TRANS_STREET_L/FeatureServer/145',
    'Street centerlines',
    'City and County of Denver',
    'context',
  ),
  denBuildings: denLayer(
    'ODC_PROP_BUILDINGOUTLINES_A/FeatureServer/111',
    'Building outlines',
    'City and County of Denver',
    'context',
  ),
  denSewers: denLayer(
    'ODC_UTIL_SANMAIN_L/FeatureServer/353',
    'Sanitary sewer mains',
    'Denver Wastewater Management',
    'surveyed',
  ),
  denSewerManholes: denLayer(
    'ODC_UTIL_SANMANHOLE_P/FeatureServer/286',
    'Sanitary manholes',
    'Denver Wastewater Management',
    'surveyed',
  ),
  denStormDrains: denLayer(
    'ODC_UTIL_STMMAIN_L/FeatureServer/288',
    'Storm sewer mains',
    'Denver Wastewater Management',
    'surveyed',
  ),
  denStormManholes: denLayer(
    'ODC_UTIL_STMMANHOLE_P/FeatureServer/289',
    'Storm manholes',
    'Denver Wastewater Management',
    'surveyed',
  ),
  denInlets: denLayer(
    'ODC_UTIL_STMINLET_P/FeatureServer/287',
    'Storm inlets',
    'Denver Wastewater Management',
    'surveyed',
  ),
  denSignals: denLayer(
    'ODC_TRANS_TRAFFICSIGNAL_P/FeatureServer/147',
    'Traffic signals',
    'Denver Department of Transportation and Infrastructure',
    'surveyed',
  ),
  // The layer behind Denver Water's own "search by address" lead map. Only the address and the
  // category are read, never the premise, tap or account numbers.
  denServiceLines: {
    id: 'https://services.arcgis.com/czCXlxn6hYtK4vdg/arcgis/rest/services/LRP_Inventory_LCRR_DEMO/FeatureServer/0',
    name: 'Lead service line inventory',
    publisher: 'Denver Water',
    url: 'https://www.denverwater.org/lead',
    confidence: 'lot-level',
    license: 'Denver Water public inventory map; reproduction and distribution prohibited',
  },
  // Public way opening permits. Only the work, the dates, where and the company are asked for;
  // the contacts' names, addresses and phones are never read (pipeline/chi/datasets.ts).
  chiPermits: chicagoData(
    'pubx-yq2d',
    'Transportation Department Permits (public way openings)',
    'Chicago Department of Transportation',
    'block-level',
  ),
  chiStreets: chicagoData('pr57-gg9e', 'Street Center Lines', 'City of Chicago', 'context'),
  chiBuildings: chicagoData('syp8-uezg', 'Building Footprints', 'City of Chicago', 'context'),
  // Right of way permits. Only the work, the dates, the site and the contractors are asked for;
  // the applicant's name and company as typed and the free-text description stay on the portal
  // (pipeline/dal/datasets.ts).
  dalPermits: dalLayer(
    'ROW/FeatureServer/2',
    'Right of way permits',
    'City of Dallas Transportation and Public Works',
    'block-level',
  ),
  dalPermitLines: dalLayer(
    'ROW/FeatureServer/1',
    'Right of way permits (lines)',
    'City of Dallas Transportation and Public Works',
    'block-level',
  ),
  dalPermitPoints: dalLayer(
    'ROW/FeatureServer/0',
    'Right of way permits (points)',
    'City of Dallas Transportation and Public Works',
    'block-level',
  ),
  dalStreets: {
    id: 'exp2-seaw',
    name: 'Streets',
    publisher: 'City of Dallas GIS Services',
    url: 'https://www.dallasopendata.com/d/exp2-seaw',
    confidence: 'context',
    license: DAL_LICENSE,
  },
  // The arterials, which the city files apart from its other streets.
  dalMajorStreets: {
    id: 'dja8-bezq',
    name: 'Major Streets',
    publisher: 'City of Dallas GIS Services',
    url: 'https://www.dallasopendata.com/d/dja8-bezq',
    confidence: 'context',
    license: DAL_LICENSE,
  },
  dalBuildings: {
    id: 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/USA_Structures_View/FeatureServer/0',
    name: 'USA Structures',
    publisher: 'FEMA and Oak Ridge National Laboratory',
    url: 'https://www.arcgis.com/home/item.html?id=0ec8512ad21e4bb987d7e848d14e7e24',
    confidence: 'context',
    license: 'CC BY 4.0',
  },
  // Dallas Water Utilities' inventory for the EPA's lead rule. Only the address, the materials
  // and how they're known are read, never the account id.
  dalServiceLines: dalLayer(
    'ServiceLine_viewing_270d198a2a4f44cdbc63b617e6c52ff2/FeatureServer/0',
    'Service line inventory',
    'Dallas Water Utilities',
    'lot-level',
  ),
  // Utility excavation permits, filed by street segment, intersection or parcel. Only the permit
  // number, the work type, the dates, the site and the description the build classifies are asked
  // for; the staff and editor fields and the notes stay on the server (pipeline/sj/datasets.ts).
  sjPermits: sjPermitLayer(16, 'Utility permits (streets)'),
  sjPermitPoints: sjPermitLayer(15, 'Utility permits (intersections)'),
  sjPermitParcels: sjPermitLayer(17, 'Utility permits (parcels)'),
  sjStreets: sjLayer(60, 'Streets', 'City of San Jose', 'context'),
  sjSewers: sjLayer(312, 'Sanitary gravity mains', 'City of San Jose Public Works', 'surveyed'),
  sjSewerManholes: sjLayer(308, 'Sanitary manholes', 'City of San Jose Public Works', 'surveyed'),
  sjStormDrains: sjLayer(300, 'Storm gravity mains', 'City of San Jose Public Works', 'surveyed'),
  sjStormManholes: sjLayer(296, 'Storm manholes', 'City of San Jose Public Works', 'surveyed'),
  sjInlets: sjLayer(295, 'Storm inlets', 'City of San Jose Public Works', 'surveyed'),
  sjLights: sjLayer(427, 'Streetlight poles', 'City of San Jose Transportation', 'surveyed'),
  sjSignals: sjLayer(
    506,
    'City owned traffic signals',
    'City of San Jose Transportation',
    'surveyed',
  ),
  // The county's lidar footprints, since the city publishes none of its own.
  sjBuildings: {
    id: 'https://maps.santaclaracounty.gov/server/rest/services/opendata/SCCGISHUB/MapServer/40',
    name: 'Buildings Footprints 2D',
    publisher: 'County of Santa Clara',
    url: 'https://maps.santaclaracounty.gov/server/rest/services/opendata/SCCGISHUB/MapServer/40',
    confidence: 'context',
    license: 'County of Santa Clara GIS data; no use limitations stated, provided as is',
  },
  // Every street address in each city, for Subsola's own type-ahead (src/sources/addressIndex.ts):
  // only the house number and street are read, and only the index built from them is published.
  addressPoints: nycOpenData('uf93-f8nk', 'Address Points', 'NYC OTI', 'context'),
  chiAddresses: {
    id: '78yw-iddh',
    name: 'Address Points',
    publisher: 'Cook County',
    url: 'https://datacatalog.cookcountyil.gov/d/78yw-iddh',
    confidence: 'context',
    license: 'Cook County open data; public domain',
  },
  dalAddresses: dalLayer(
    'AddressPoints/FeatureServer/0',
    'Address points',
    'City of Dallas',
    'context',
  ),
  denAddresses: denLayer(
    'ODC_CITY_LOC_ADDRESSPUBLIC_P/FeatureServer/31',
    'Addresses',
    'City and County of Denver',
    'context',
  ),
  sjAddresses: sjLayer(36, 'Site addresses', 'City of San Jose', 'context'),
  dcAddresses: dcGis(
    'DCGIS_DATA/Location_WebMercator/MapServer/0',
    'Address Points (Master Address Repository)',
    'OCTO',
    'context',
  ),
  sfAddresses: {
    id: '3mea-di5p',
    name: 'Addresses (Enterprise Addressing System)',
    publisher: 'City and County of San Francisco',
    url: 'https://data.sf.gov/d/3mea-di5p',
    confidence: 'context',
    license: 'DataSF, Open Data Commons PDDL',
  },
  laAddresses: {
    id: 'https://services.arcgis.com/RmCCgQtiZLDCtblq/arcgis/rest/services/eGIS_Addressing_ADDRESS_POINTSv2/FeatureServer/0',
    name: 'Address points (CAMS)',
    publisher: 'County of Los Angeles',
    url: 'https://egis-lacounty.hub.arcgis.com/',
    confidence: 'context',
    license:
      'County of Los Angeles eGIS terms: free to copy, publish and adapt; no County endorsement',
  },
  sdAddresses: sanGisLayer('Address_Points', 'Address points', 'SanGIS', 'context'),
  seaAddresses: {
    id: 'https://services.arcgis.com/Ej0PsM5Aw677QF1W/arcgis/rest/services/ADDRESS_POINT_642/FeatureServer/0',
    name: 'Addresses in King County',
    publisher: 'King County',
    url: 'https://gis-kingcounty.opendata.arcgis.com/',
    confidence: 'context',
    license:
      'King County GIS terms: free to copy and use; not to be sold without a written agreement',
  },
  // San Jose Water's inventory for the EPA's lead rule. Paused (PAUSED_SOURCES): the company's
  // website terms bar reproducing or republishing its content.
  sjServiceLines: {
    id: 'https://services5.arcgis.com/ixApgzWW1LUCWXMY/arcgis/rest/services/Service_Line_Material_Inventory_view/FeatureServer/2',
    name: 'Service line material inventory',
    publisher: 'San Jose Water',
    url: 'https://www.sjwater.com/service-line-inventory/',
    confidence: 'lot-level',
    license:
      'San Jose Water website terms of use; no reproduction or republishing without permission',
  },
  conEdStructures: {
    id: 'con-ed-structures',
    name: 'Network structures (hosting capacity map)',
    publisher: 'Con Edison',
    url: 'https://www.coned.com/en/business-partners/hosting-capacity',
    confidence: 'utility',
    license: 'Con Edison public map; no reuse without written consent',
  },
  osm: {
    id: 'osm',
    name: 'OpenStreetMap (manholes, street lamps, traffic signals)',
    publisher: 'OpenStreetMap contributors',
    url: 'https://www.openstreetmap.org/copyright',
    confidence: 'crowdsourced',
    license: 'ODbL 1.0',
  },
  aerial: {
    id: 'nys-orthos',
    name: 'Orthoimagery, latest (about 12 in/pixel)',
    publisher: 'NYS ITS GIS Program Office',
    url: 'https://orthos.its.ny.gov/',
    confidence: 'context',
    license: 'NYS ITS Geospatial Services orthoimagery; no license stated, provided as is',
  },
} satisfies Record<string, SourceInfo>;

export type SourceKey = keyof typeof SOURCES;

/**
 * Sources whose own terms don't allow republishing them, held back from every payload (the build,
 * the map, lot reports, the MCP server) while Subsola asks the publisher for permission. Each
 * names who is being asked and where people can look the record up themselves. Removing an entry
 * brings the source back with the next build. See README, "Data terms and attribution".
 */
export const PAUSED_SOURCES: Partial<Record<SourceKey, { owner: string; lookup: string }>> = {
  dcMains: { owner: 'DC Water', lookup: 'https://geo.dcwater.com/Lead/' },
  dcServiceLines: { owner: 'DC Water', lookup: 'https://geo.dcwater.com/Lead/' },
  sdServiceLines: {
    owner: 'the City of San Diego',
    lookup: 'https://www.sandiego.gov/public-utilities/water-quality/lead-copper',
  },
  denServiceLines: { owner: 'Denver Water', lookup: 'https://www.denverwater.org/lead' },
  conEdStructures: {
    owner: 'Con Edison',
    lookup: 'https://www.coned.com/en/business-partners/hosting-capacity',
  },
  sdLights: { owner: 'the City of San Diego', lookup: 'https://www.sandiego.gov/' },
  sdSignals: { owner: 'the City of San Diego', lookup: 'https://www.sandiego.gov/' },
  sjServiceLines: {
    owner: 'San Jose Water',
    lookup: 'https://www.sjwater.com/service-line-inventory/',
  },
};

export const isPaused = (key: SourceKey | undefined): boolean =>
  key !== undefined && key in PAUSED_SOURCES;

/** What a card or answer says in place of a paused source's records. */
export const pausedNote = (key: SourceKey) => {
  const paused = PAUSED_SOURCES[key];
  return paused
    ? `Not shown while Subsola asks ${paused.owner} for permission to republish it. Look it up on ${paused.owner}'s own site: ${paused.lookup}`
    : null;
};
