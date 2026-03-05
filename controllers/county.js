const counties = [
  {
    "id": 1,
    "state_name": "Alabama",
    "state_code": "AL",
    "county_name": "Baldwin",
    "property_tax_link": "https://baldwinproperty.countygovservices.com/Property/Search",
    "path": "/tax/AL/baldwin",
    "status": 1
  },
  {
    "id": 2,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Brevard",
    "property_tax_link": "https://county-taxes.net/brevard/property-tax",
    "path": "/tax/FL/brevard",
    "status": 1
  },
  {
    "id": 3,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Broward",
    "property_tax_link": "https://county-taxes.net/broward/property-tax",
    "path": "/tax/FL/broward",
    "status": 1
  },
  {
    "id": 4,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Columbia",
    "property_tax_link": "https://columbia.floridatax.us/AccountSearch?s=pt",
    "path": "/tax/FL/columbia",
    "status": 1
  },
  {
    "id": 5,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Duval",
    "property_tax_link": "https://county-taxes.net/fl-duval/property-tax",
    "path": "/tax/FL/duval",
    "status": 1
  },
  {
    "id": 6,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Flagler",
    "property_tax_link": "https://county-taxes.net/fl-flagler/property-tax",
    "path": "/tax/FL/flagler",
    "status": 1
  },
  {
    "id": 7,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Lee",
    "property_tax_link": "https://county-taxes.net/fl-lee/property-tax",
    "path": "/tax/FL/lee",
    "status": 1
  },
  {
    "id": 8,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Miami-Dade",
    "property_tax_link": "https://county-taxes.net/fl-miamidade/property-tax",
    "path": "/tax/FL/miami-dade",
    "status": 1
  },
  {
    "id": 9,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Orange",
    "property_tax_link": "https://county-taxes.net/fl-orange/property-tax",
    "path": "/tax/FL/orange",
    "status": 1
  },
  {
    "id": 10,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Palm-Beach",
    "property_tax_link": "https://pbctax.publicaccessnow.com/PropertyTax.aspx",
    "path": "/tax/FL/palm-beach",
    "status": 1
  },
  {
    "id": 11,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Sarasota",
    "property_tax_link": "https://sarasotataxcollector.publicaccessnow.com/TaxCollector/PropertyTaxSearch.aspx",
    "path": "/tax/FL/sarasota",
    "status": 1
  },
  {
    "id": 12,
    "state_name": "Arizona",
    "state_code": "AZ",
    "county_name": "Maricopa",
    "property_tax_link": "https://treasurer.maricopa.gov/",
    "path": "/tax/AZ/maricopa",
    "status": 1
  },
  {
    "id": 13,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Los Angeles",
    "property_tax_link": "https://vcheck.ttc.lacounty.gov/proptax.php?page=screen",
    "path": "/tax/CA/los-angeles",
    "status": 1
  },
  {
    "id": 14,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "San Diego",
    "property_tax_link": "https://wps.sdttc.com/webpayments/CoSDTreasurer2/search",
    "path": "/tax/CA/san-diego",
    "status": 1
  },
  {
    "id": 15,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Jefferson",
    "property_tax_link": "https://treasurerpropertysearch.jeffco.us/propertyrecordssearch/ain",
    "path": "/tax/CO/jefferson",
    "status": 1
  },
  {
    "id": 16,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Boulder",
    "property_tax_link": "https://treasurer.bouldercounty.org/treasurer/web/login.jsp",
    "path": "/tax/CO/boulder",
    "status": 1
  },
  {
    "id": 17,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Citrus",
    "property_tax_link": "https://county-taxes.net/citrus/property-tax",
    "path": "/tax/FL/citrus",
    "status": 1
  },
  {
    "id": 18,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Douglas",
    "property_tax_link": "https://apps.douglas.co.us/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/douglas",
    "status": 1
  },
  {
    "id": 20,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Contra Costa",
    "property_tax_link": "https://taxcolp.cccttc.us/lookup/",
    "path": "/tax/CA/contra-costa",
    "status": 1
  },
  {
    "id": 21,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Hillsborough",
    "property_tax_link": "https://county-taxes.net/hillsborough/property-tax",
    "path": "/tax/FL/hillsborough",
    "status": 1
  },
  {
    "id": 22,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Pinellas",
    "property_tax_link": "https://county-taxes.net/pinellas/property-tax",
    "path": "/tax/FL/pinellas",
    "status": 1
  },
  {
    "id": 23,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Hernando",
    "property_tax_link": "https://county-taxes.net/fl-hernando/property-tax",
    "path": "/tax/FL/hernando",
    "status": 1
  },
  {
    "id": 24,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Indian River",
    "property_tax_link": "https://county-taxes.net/indianriver/property-tax",
    "path": "/tax/FL/indian-river",
    "status": 1
  },
  {
    "id": 25,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Seminole",
    "property_tax_link": "https://county-taxes.net/fl-seminole/property-tax",
    "path": "/tax/FL/seminole",
    "status": 1
  },
  {
    "id": 26,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Charlotte",
    "property_tax_link": "https://county-taxes.net/charlotte/property-tax",
    "path": "/tax/FL/charlotte",
    "status": 1
  },
  {
    "id": 27,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Collier",
    "property_tax_link": "https://county-taxes.net/fl-collier/property-tax",
    "path": "/tax/FL/collier",
    "status": 1
  },
  {
    "id": 28,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Bay",
    "property_tax_link": "https://county-taxes.net/fl-bay/property-tax",
    "path": "/tax/FL/bay",
    "status": 1
  },
  {
    "id": 29,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Pasco",
    "property_tax_link": "https://county-taxes.net/fl-pasco/property-tax",
    "path": "/tax/FL/pasco",
    "status": 1
  },
  {
    "id": 30,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "St. Lucie",
    "property_tax_link": "https://county-taxes.net/stlucie/property-tax",
    "path": "/tax/FL/st-lucie",
    "status": 1
  },
  {
    "id": 31,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Sumter",
    "property_tax_link": "https://county-taxes.net/sumter/property-tax",
    "path": "/tax/FL/sumter",
    "status": 1
  },
  {
    "id": 32,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Clay",
    "property_tax_link": "https://county-taxes.net/fl-clay/property-tax",
    "path": "/tax/FL/clay",
    "status": 1
  },
  {
    "id": 33,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Osceola",
    "property_tax_link": "https://county-taxes.net/osceola/property-tax",
    "path": "/tax/FL/osceola",
    "status": 1
  },
  {
    "id": 34,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Santa Rosa",
    "property_tax_link": "https://county-taxes.net/fl-santarosa/property-tax",
    "path": "/tax/FL/santa-rosa",
    "status": 1
  },
  {
    "id": 35,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Walton",
    "property_tax_link": "https://county-taxes.net/fl-walton/property-tax",
    "path": "/tax/FL/walton",
    "status": 1
  },
  {
    "id": 36,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Volusia",
    "property_tax_link": "https://county-taxes.net/vctaxcollector/property-tax",
    "path": "/tax/FL/volusia",
    "status": 1
  },
  {
    "id": 37,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Monroe",
    "property_tax_link": "https://county-taxes.net/fl-monroe/property-tax",
    "path": "/tax/FL/monroe",
    "status": 1
  },
  {
    "id": 38,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Martin",
    "property_tax_link": "https://county-taxes.net/fl-martin/property-tax",
    "path": "/tax/FL/martin",
    "status": 1
  },
  {
    "id": 39,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Nassau",
    "property_tax_link": "https://county-taxes.net/fl-nassau/property-tax",
    "path": "/tax/FL/nassau",
    "status": 1
  },
  {
    "id": 40,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Okaloosa",
    "property_tax_link": "https://county-taxes.net/okaloosa/property-tax",
    "path": "/tax/FL/okaloosa",
    "status": 1
  },
  {
    "id": 41,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Lake",
    "property_tax_link": "https://county-taxes.net/lake/property-tax",
    "path": "/tax/FL/lake",
    "status": 1
  },
  {
    "id": 42,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Alachua",
    "property_tax_link": "https://county-taxes.net/alachua/property-tax",
    "path": "/tax/FL/alachua",
    "status": 1
  },
  {
    "id": 43,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Escambia",
    "property_tax_link": "https://county-taxes.net/fl-escambia/property-tax",
    "path": "/tax/FL/escambia",
    "status": 1
  },
  {
    "id": 44,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Lake",
    "property_tax_link": "https://lakecountyco-treasurer.tylerhost.net/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/lake",
    "status": 1
  },
  {
    "id": 45,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Grand",
    "property_tax_link": "https://ecomm.co.grand.co.us/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/grand",
    "status": 1
  },
  {
    "id": 46,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Crowley",
    "property_tax_link": "https://crowleycountyco-treasurer.tylerhost.net/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/crowley",
    "status": 1
  },
  {
    "id": 47,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Broomfield",
    "property_tax_link": "https://egov.broomfield.org/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/broomfield",
    "status": 1
  },
  {
    "id": 48,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Conejos",
    "property_tax_link": "https://conejoscountyco-treasurer.tylerhost.net/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/conejos",
    "status": 1
  },
  {
    "id": 49,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Weld",
    "property_tax_link": "https://www.weldtax.com/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/weld",
    "status": 1
  },
  {
    "id": 50,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Ouray",
    "property_tax_link": "https://ouraycountyco-treasurer.tylerhost.net/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/ouray",
    "status": 1
  },
  {
    "id": 51,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Routt",
    "property_tax_link": "https://treasurer.co.routt.co.us:8443/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/routt",
    "status": 1
  },
  {
    "id": 52,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Delta",
    "property_tax_link": "https://treasurer.deltacountyco.gov/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/delta",
    "status": 1
  },
  {
    "id": 53,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "La Plata",
    "property_tax_link": "https://treasurer.lpcgov.org/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/la-plata",
    "status": 1
  },
  {
    "id": 54,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Las Animas",
    "property_tax_link": "http://treasurer.lasanimascounty.net:8081/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/las-animas",
    "status": 1
  },
  {
    "id": 55,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Fremont",
    "property_tax_link": "https://fremontcountyco-tsr-web.tylerhost.net/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/fremont",
    "status": 1
  },
  {
    "id": 56,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Elbert",
    "property_tax_link": "https://services.elbertcounty-co.gov:8443/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/elbert",
    "status": 1
  },
  {
    "id": 57,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Phillips",
    "property_tax_link": "https://treasurer.phillipscogov.com:8447/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/phillips",
    "status": 1
  },
  {
    "id": 58,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Mineral",
    "property_tax_link": "https://eaglewebtreasurer.mineralcountycolorado.com:8443/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/mineral",
    "status": 1
  },
  {
    "id": 59,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Gilpin",
    "property_tax_link": "https://gilpincountyco-tsrweb.tylerhost.net/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/gilpin",
    "status": 1
  },
  {
    "id": 60,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Pitkin",
    "property_tax_link": "https://treasurer.pitkincounty.com/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/pitkin",
    "status": 1
  },
  {
    "id": 61,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Jackson",
    "property_tax_link": "https://eagleweb.jacksoncountyco.gov:4443/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/jackson",
    "status": 1
  },
  {
    "id": 62,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Morgan",
    "property_tax_link": "https://morgancountyco-treasurer.tylerhost.net/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/morgan",
    "status": 1
  },
  {
    "id": 63,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Costilla",
    "property_tax_link": "https://costillacountyco-treasurer.tylerhost.net/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/costilla",
    "status": 1
  },
  {
    "id": 64,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Otero",
    "property_tax_link": "https://oterocountynm-treasurer.tylerhost.net/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/otero",
    "status": 1
  },
  {
    "id": 65,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "McIntosh",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/McIntosh?tax_info_sel=property_id",
    "path": "/tax/OK/mcintosh",
    "status": 1
  },
  {
    "id": 66,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Cotton",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Cotton?tax_info_sel=property_id",
    "path": "/tax/OK/cotton",
    "status": 1
  },
  {
    "id": 67,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Dewey",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Dewey?tax_info_sel=property_id",
    "path": "/tax/OK/dewey",
    "status": 1
  },
  {
    "id": 68,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Okfuskee",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Okfuskee?tax_info_sel=property_id",
    "path": "/tax/OK/okfuskee",
    "status": 1
  },
  {
    "id": 69,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Washita",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Washita?tax_info_sel=property_id",
    "path": "/tax/OK/washita",
    "status": 1
  },
  {
    "id": 70,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Comanche",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Comanche?tax_info_sel=property_id",
    "path": "/tax/OK/comanche",
    "status": 1
  },
  {
    "id": 71,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Garfield",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Garfield?tax_info_sel=property_id",
    "path": "/tax/OK/garfield",
    "status": 1
  },
  {
    "id": 72,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Murray",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Murray?tax_info_sel=property_id",
    "path": "/tax/OK/murray",
    "status": 1
  },
  {
    "id": 73,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Woodward",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Woodward?tax_info_sel=property_id",
    "path": "/tax/OK/woodward",
    "status": 1
  },
  {
    "id": 74,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Logan",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Logan?tax_info_sel=property_id",
    "path": "/tax/OK/logan",
    "status": 1
  },
  {
    "id": 75,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "McClain",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/McClain?tax_info_sel=property_id",
    "path": "/tax/OK/mcclain",
    "status": 1
  },
  {
    "id": 76,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Major",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Major?tax_info_sel=property_id",
    "path": "/tax/OK/major",
    "status": 1
  },
  {
    "id": 77,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Pottawatomie",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Pottawatomie?tax_info_sel=property_id",
    "path": "/tax/OK/pottawatomie",
    "status": 1
  },
  {
    "id": 78,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Beaver",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/beaver?tax_info_sel=property_id",
    "path": "/tax/OK/beaver",
    "status": 1
  },
  {
    "id": 79,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Caddo",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Caddo?tax_info_sel=property_id",
    "path": "/tax/OK/caddo",
    "status": 1
  },
  {
    "id": 80,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Haskell",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Haskell?tax_info_sel=property_id",
    "path": "/tax/OK/haskell",
    "status": 1
  },
  {
    "id": 81,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Pawnee",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Pawnee?tax_info_sel=property_id",
    "path": "/tax/OK/pawnee",
    "status": 1
  },
  {
    "id": 82,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Kiowa",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Kiowa?tax_info_sel=property_id",
    "path": "/tax/OK/kiowa",
    "status": 1
  },
  {
    "id": 83,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Marshall",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Marshall?tax_info_sel=property_id",
    "path": "/tax/OK/marshall",
    "status": 1
  },
  {
    "id": 84,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Johnston",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Johnston?tax_info_sel=property_id",
    "path": "/tax/OK/johnston",
    "status": 1
  },
  {
    "id": 85,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Love",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Love?tax_info_sel=property_id",
    "path": "/tax/OK/love",
    "status": 1
  },
  {
    "id": 86,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Pontotoc",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Pontotoc?tax_info_sel=property_id",
    "path": "/tax/OK/pontotoc",
    "status": 1
  },
  {
    "id": 87,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Rogers",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Rogers?tax_info_sel=property_id",
    "path": "/tax/OK/rogers",
    "status": 1
  },
  {
    "id": 88,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Custer",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/custer?tax_info_sel=property_id",
    "path": "/tax/OK/custer",
    "status": 1
  },
  {
    "id": 89,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Muskogee",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/muskogee?tax_info_sel=property_id",
    "path": "/tax/OK/muskogee",
    "status": 1
  },
  {
    "id": 90,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Ellis",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/ellis?tax_info_sel=property_id",
    "path": "/tax/OK/ellis",
    "status": 1
  },
  {
    "id": 91,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Mayes",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/mayes?tax_info_sel=property_id",
    "path": "/tax/OK/mayes",
    "status": 1
  },
  {
    "id": 92,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Creek",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Creek?tax_info_sel=property_id",
    "path": "/tax/OK/creek",
    "status": 1
  },
  {
    "id": 93,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Nowata",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/nowata?tax_info_sel=property_id",
    "path": "/tax/OK/nowata",
    "status": 1
  },
  {
    "id": 94,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Okmulgee",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/okmulgee?tax_info_sel=property_id",
    "path": "/tax/OK/okmulgee",
    "status": 1
  },
  {
    "id": 95,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Atoka",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Atoka?tax_info_sel=property_id",
    "path": "/tax/OK/atoka",
    "status": 1
  },
  {
    "id": 96,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Lincoln",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/lincoln?tax_info_sel=property_id",
    "path": "/tax/OK/lincoln",
    "status": 1
  },
  {
    "id": 97,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Payne",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Payne?tax_info_sel=property_id",
    "path": "/tax/OK/payne",
    "status": 1
  },
  {
    "id": 98,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Pittsburg",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Pittsburg?tax_info_sel=property_id",
    "path": "/tax/OK/pittsburg",
    "status": 1
  },
  {
    "id": 99,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Coal",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Coal?tax_info_sel=property_id",
    "path": "/tax/OK/coal",
    "status": 1
  },
  {
    "id": 100,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Canadian",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/canadian?tax_info_sel=property_id",
    "path": "/tax/OK/canadian",
    "status": 1
  },
  {
    "id": 101,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Cherokee",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Cherokee?tax_info_sel=property_id",
    "path": "/tax/OK/cherokee",
    "status": 1
  },
  {
    "id": 102,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Harmon",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/harmon?tax_info_sel=property_id",
    "path": "/tax/OK/harmon",
    "status": 1
  },
  {
    "id": 103,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Stephens",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Stephens?tax_info_sel=property_id",
    "path": "/tax/OK/stephens",
    "status": 1
  },
  {
    "id": 104,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Garvin",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Garvin?tax_info_sel=property_id",
    "path": "/tax/OK/garvin",
    "status": 1
  },
  {
    "id": 105,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Jackson",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/jackson?tax_info_sel=property_id",
    "path": "/tax/OK/jackson",
    "status": 1
  },
  {
    "id": 106,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Jefferson",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Jefferson?tax_info_sel=property_id",
    "path": "/tax/OK/jefferson",
    "status": 1
  },
  {
    "id": 107,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Le Flore",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/leflore?tax_info_sel=property_id",
    "path": "/tax/OK/le-flore",
    "status": 1
  },
  {
    "id": 108,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Alfalfa",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Alfalfa?tax_info_sel=property_id",
    "path": "/tax/OK/alfalfa",
    "status": 1
  },
  {
    "id": 109,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Grant",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Grant?tax_info_sel=property_id",
    "path": "/tax/OK/grant",
    "status": 1
  },
  {
    "id": 110,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Osage",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Osage?tax_info_sel=property_id",
    "path": "/tax/OK/osage",
    "status": 1
  },
  {
    "id": 111,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Bryan",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Bryan?tax_info_sel=property_id",
    "path": "/tax/OK/bryan",
    "status": 1
  },
  {
    "id": 112,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Roger Mills",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/RogerMills?tax_info_sel=property_id",
    "path": "/tax/OK/roger-mills",
    "status": 1
  },
  {
    "id": 113,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Sequoyah",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Sequoyah?tax_info_sel=property_id",
    "path": "/tax/OK/sequoyah",
    "status": 1
  },
  {
    "id": 114,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Craig",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Craig?tax_info_sel=property_id",
    "path": "/tax/OK/craig",
    "status": 1
  },
  {
    "id": 115,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Grady",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Grady?tax_info_sel=property_id",
    "path": "/tax/OK/grady",
    "status": 1
  },
  {
    "id": 116,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Pushmataha",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Pushmataha?tax_info_sel=property_id",
    "path": "/tax/OK/pushmataha",
    "status": 1
  },
  {
    "id": 117,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Wagoner",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Wagoner?tax_info_sel=property_id",
    "path": "/tax/OK/wagoner",
    "status": 1
  },
  {
    "id": 118,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Delaware",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Delaware?tax_info_sel=property_id",
    "path": "/tax/OK/delaware",
    "status": 1
  },
  {
    "id": 119,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Ottawa",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Ottawa?tax_info_sel=property_id",
    "path": "/tax/OK/ottawa",
    "status": 1
  },
  {
    "id": 120,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Seminole",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Seminole?tax_info_sel=property_id",
    "path": "/tax/OK/seminole",
    "status": 1
  },
  {
    "id": 121,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Tulsa",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Tulsa?tax_info_sel=property_id",
    "path": "/tax/OK/tulsa",
    "status": 1
  },
  {
    "id": 122,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Adair",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Adair?tax_info_sel=property_id",
    "path": "/tax/OK/adair",
    "status": 1
  },
  {
    "id": 123,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Choctaw",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Choctaw?tax_info_sel=property_id",
    "path": "/tax/OK/choctaw",
    "status": 1
  },
  {
    "id": 124,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Greer",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Greer?tax_info_sel=property_id",
    "path": "/tax/OK/greer",
    "status": 1
  },
  {
    "id": 125,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Harper",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Harper?tax_info_sel=property_id",
    "path": "/tax/OK/harper",
    "status": 1
  },
  {
    "id": 126,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Noble",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Noble?tax_info_sel=property_id",
    "path": "/tax/OK/noble",
    "status": 1
  },
  {
    "id": 127,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Texas",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Texas?tax_info_sel=property_id",
    "path": "/tax/OK/texas",
    "status": 1
  },
  {
    "id": 128,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Blaine",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Blaine?tax_info_sel=property_id",
    "path": "/tax/OK/blaine",
    "status": 1
  },
  {
    "id": 129,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Latimer",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Latimer?tax_info_sel=property_id",
    "path": "/tax/OK/latimer",
    "status": 1
  },
  {
    "id": 130,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Cimarron",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Cimarron?tax_info_sel=property_id",
    "path": "/tax/OK/cimarron",
    "status": 1
  },
  {
    "id": 131,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Woods",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Woods?tax_info_sel=property_id",
    "path": "/tax/OK/woods",
    "status": 1
  },
  {
    "id": 132,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Beckham",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Beckham?tax_info_sel=property_id",
    "path": "/tax/OK/beckham",
    "status": 1
  },
  {
    "id": 133,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Carter",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Carter?tax_info_sel=property_id",
    "path": "/tax/OK/carter",
    "status": 1
  },
  {
    "id": 134,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Kay",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Kay?tax_info_sel=property_id",
    "path": "/tax/OK/kay",
    "status": 1
  },
  {
    "id": 135,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Kingfisher",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Kingfisher?tax_info_sel=property_id",
    "path": "/tax/OK/kingfisher",
    "status": 1
  },
  {
    "id": 136,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "McCurtain",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/McCurtain?tax_info_sel=property_id",
    "path": "/tax/OK/mccurtain",
    "status": 1
  },
  {
    "id": 137,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Tillman",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Tillman?tax_info_sel=property_id",
    "path": "/tax/OK/tillman",
    "status": 1
  },
  {
    "id": 138,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Washington",
    "property_tax_link": "https://oktaxrolls.com/searchTaxRoll/Washington?tax_info_sel=property_id",
    "path": "/tax/OK/washington",
    "status": 1
  },
  {
    "id": 139,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Adams",
    "property_tax_link": "https://adamswa-taxsifter.publicaccessnow.com/Search/Results.aspx",
    "path": "/tax/WA/adams",
    "status": 1
  },
  {
    "id": 140,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Monterey",
    "property_tax_link": "https://common3.mptsweb.com/mbc/monterey/tax/search",
    "path": "/tax/CA/monterey",
    "status": 1
  },
  {
    "id": 141,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Trinity",
    "property_tax_link": "https://common1.mptsweb.com/mbc/trinity/tax/search",
    "path": "/tax/CA/trinity",
    "status": 1
  },
  {
    "id": 142,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Yolo",
    "property_tax_link": "https://common2.mptsweb.com/MBC/yolo/tax/search",
    "path": "/tax/CA/yolo",
    "status": 1
  },
  {
    "id": 143,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Butte",
    "property_tax_link": "https://common2.mptsweb.com/mbc/butte/tax/search",
    "path": "/tax/CA/butte",
    "status": 1
  },
  {
    "id": 144,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Imperial",
    "property_tax_link": "https://common2.mptsweb.com/mbc/imperial/tax/search",
    "path": "/tax/CA/imperial",
    "status": 1
  },
  {
    "id": 145,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Tuolumne",
    "property_tax_link": "https://common3.mptsweb.com/mbc/tuolumne/tax/search",
    "path": "/tax/CA/tuolumne",
    "status": 1
  },
  {
    "id": 146,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Amador",
    "property_tax_link": "https://common1.mptsweb.com/MBC/amador/tax/search",
    "path": "/tax/CA/amador",
    "status": 1
  },
  {
    "id": 147,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Kings",
    "property_tax_link": "https://common1.mptsweb.com/MBC/kings/tax/search",
    "path": "/tax/CA/kings",
    "status": 1
  },
  {
    "id": 148,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Mono",
    "property_tax_link": "https://common2.mptsweb.com/mbc/mono/tax/search",
    "path": "/tax/CA/mono",
    "status": 1
  },
  {
    "id": 149,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "San Benito",
    "property_tax_link": "https://common2.mptsweb.com/mbc/sanbenito/tax/search",
    "path": "/tax/CA/san-benito",
    "status": 1
  },
  {
    "id": 150,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Placer",
    "property_tax_link": "https://common3.mptsweb.com/mbc/placer/tax/search",
    "path": "/tax/CA/placer",
    "status": 1
  },
  {
    "id": 151,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Lake",
    "property_tax_link": "https://common2.mptsweb.com/MBC/lake/tax/search",
    "path": "/tax/CA/lake",
    "status": 1
  },
  {
    "id": 152,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Tulare",
    "property_tax_link": "https://common2.mptsweb.com/MBC/tulare/tax/search",
    "path": "/tax/CA/tulare",
    "status": 1
  },
  {
    "id": 153,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Del Norte",
    "property_tax_link": "https://common3.mptsweb.com/mbc/delnorte/tax/search",
    "path": "/tax/CA/del-norte",
    "status": 1
  },
  {
    "id": 154,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Stanislaus",
    "property_tax_link": "https://common3.mptsweb.com/MBC/stanislaus/tax/search",
    "path": "/tax/CA/stanislaus",
    "status": 1
  },
  {
    "id": 155,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Napa",
    "property_tax_link": "https://common2.mptsweb.com/mbc/napa/tax/search/",
    "path": "/tax/CA/napa",
    "status": 1
  },
  {
    "id": 156,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Nevada",
    "property_tax_link": "https://common2.mptsweb.com/mbc/nevada/tax/search",
    "path": "/tax/CA/nevada",
    "status": 1
  },
  {
    "id": 157,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "San Juan",
    "property_tax_link": "https://parcel.sanjuancountywa.gov/PropertyAccess/PropertySearch.aspx?cid=0",
    "path": "/tax/WA/san-juan",
    "status": 1
  },
  {
    "id": 158,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Mariposa",
    "property_tax_link": "https://common2.mptsweb.com/MBC/mariposa/tax/search",
    "path": "/tax/CA/mariposa",
    "status": 1
  },
  {
    "id": 159,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Shasta",
    "property_tax_link": "https://common2.mptsweb.com/mbc/shasta/tax/search",
    "path": "/tax/CA/shasta",
    "status": 1
  },
  {
    "id": 160,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Sonoma",
    "property_tax_link": "https://common3.mptsweb.com/mbc/sonoma/tax/search",
    "path": "/tax/CA/sonoma",
    "status": 1
  },
  {
    "id": 161,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Modoc",
    "property_tax_link": "https://common2.mptsweb.com/mbc/modoc/tax/search",
    "path": "/tax/CA/modoc",
    "status": 1
  },
  {
    "id": 162,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Siskiyou",
    "property_tax_link": "https://common1.mptsweb.com/mbc/siskiyou/tax/search",
    "path": "/tax/CA/siskiyou",
    "status": 1
  },
  {
    "id": 163,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Calaveras",
    "property_tax_link": "https://common3.mptsweb.com/mbc/calaveras/tax/search",
    "path": "/tax/CA/calaveras",
    "status": 1
  },
  {
    "id": 164,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Madera",
    "property_tax_link": "https://common3.mptsweb.com/mbc/madera/tax/search",
    "path": "/tax/CA/madera",
    "status": 1
  },
  {
    "id": 165,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Merced",
    "property_tax_link": "https://common3.mptsweb.com/mbc/merced/tax/search",
    "path": "/tax/CA/merced",
    "status": 1
  },
  {
    "id": 166,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Plumas",
    "property_tax_link": "https://common1.mptsweb.com/mbc/plumas/tax/search",
    "path": "/tax/CA/plumas",
    "status": 1
  },
  {
    "id": 167,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "El Dorado",
    "property_tax_link": "https://common3.mptsweb.com/MBC/eldorado/tax/search",
    "path": "/tax/CA/el-dorado",
    "status": 1
  },
  {
    "id": 168,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Humboldt",
    "property_tax_link": "https://common2.mptsweb.com/mbc/humboldt/tax/search",
    "path": "/tax/CA/humboldt",
    "status": 1
  },
  {
    "id": 169,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Tehama",
    "property_tax_link": "https://common1.mptsweb.com/mbc/tehama/tax/search",
    "path": "/tax/CA/tehama",
    "status": 1
  },
  {
    "id": 170,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "San Joaquin",
    "property_tax_link": "https://common3.mptsweb.com/MBC/sanjoaquin/tax/search",
    "path": "/tax/CA/san-joaquin",
    "status": 1
  },
  {
    "id": 171,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Colusa",
    "property_tax_link": "https://common2.mptsweb.com/MBC/Colusa/tax/search",
    "path": "/tax/CA/colusa",
    "status": 1
  },
  {
    "id": 172,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Yuba",
    "property_tax_link": "https://common2.mptsweb.com/mbc/yuba/tax/search",
    "path": "/tax/CA/yuba",
    "status": 1
  },
  {
    "id": 173,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Darke",
    "property_tax_link": "https://darkecountyrealestate.org/",
    "path": "/tax/OH/darke",
    "status": 1
  },
  {
    "id": 174,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Adams",
    "property_tax_link": "https://adcotax.com/treasurer/web/login.jsp",
    "path": "/tax/CO/adams",
    "status": 1
  },
  {
    "id": 175,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Denver",
    "property_tax_link": "https://www.denvergov.org/property",
    "path": "/tax/CO/denver",
    "status": 1
  },
  {
    "id": 176,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Larimer",
    "property_tax_link": "https://www.larimer.gov/treasurer/search",
    "path": "/tax/CO/larimer",
    "status": 1
  },
  {
    "id": 177,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Oklahoma",
    "property_tax_link": "https://docs.oklahomacounty.org/treasurer/PublicAccess.asp",
    "path": "/tax/OK/oklahoma",
    "status": 1
  },
  {
    "id": 178,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Douglas",
    "property_tax_link": "https://douglaswa-taxsifter.publicaccessnow.com/Search/Results.aspx",
    "path": "/tax/WA/douglas",
    "status": 1
  },
  {
    "id": 179,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Lincoln",
    "property_tax_link": "https://lincolnwa-taxsifter.publicaccessnow.com/Search/Results.aspx",
    "path": "/tax/WA/lincoln",
    "status": 1
  },
  {
    "id": 180,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Ferry",
    "property_tax_link": "https://ferrywa-taxsifter.publicaccessnow.com/Search/Results.aspx",
    "path": "/tax/WA/ferry",
    "status": 1
  },
  {
    "id": 181,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Skamania",
    "property_tax_link": "https://skamaniawa-taxsifter.publicaccessnow.com/Search/Results.aspx",
    "path": "/tax/WA/skamania",
    "status": 1
  },
  {
    "id": 182,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Grays Harbor",
    "property_tax_link": "https://graysharborwa-taxsifter.publicaccessnow.com/Search/Results.aspx",
    "path": "/tax/WA/grays-harbor",
    "status": 1
  },
  {
    "id": 183,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Mason",
    "property_tax_link": "https://property.masoncountywa.gov/TaxSifter/Search/Results.aspx",
    "path": "/tax/WA/mason",
    "status": 1
  },
  {
    "id": 184,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Pacific",
    "property_tax_link": "https://pacificwa-taxsifter.publicaccessnow.com/Search/Results.aspx",
    "path": "/tax/WA/pacific",
    "status": 1
  },
  {
    "id": 185,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Adams",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=2",
    "path": "/tax/IA/adams",
    "status": 1
  },
  {
    "id": 186,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Allamakee",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=3",
    "path": "/tax/IA/allamakee",
    "status": 1
  },
  {
    "id": 187,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Cherokee",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=18",
    "path": "/tax/IA/cherokee",
    "status": 1
  },
  {
    "id": 188,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Sac",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=81",
    "path": "/tax/IA/sac",
    "status": 1
  },
  {
    "id": 189,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Hardin",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=42",
    "path": "/tax/IA/hardin",
    "status": 1
  },
  {
    "id": 190,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Mahaska",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=62",
    "path": "/tax/IA/mahaska",
    "status": 1
  },
  {
    "id": 191,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Taylor",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=87",
    "path": "/tax/IA/taylor",
    "status": 1
  },
  {
    "id": 192,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Butler",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=12",
    "path": "/tax/IA/butler",
    "status": 1
  },
  {
    "id": 193,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Scott",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=82",
    "path": "/tax/IA/scott",
    "status": 1
  },
  {
    "id": 194,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Shelby",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=83",
    "path": "/tax/IA/shelby",
    "status": 1
  },
  {
    "id": 195,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Clayton",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=22",
    "path": "/tax/IA/clayton",
    "status": 1
  },
  {
    "id": 196,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Davis",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=26",
    "path": "/tax/IA/davis",
    "status": 1
  },
  {
    "id": 197,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Kossuth",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=55",
    "path": "/tax/IA/kossuth",
    "status": 1
  },
  {
    "id": 198,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Muscatine",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=70",
    "path": "/tax/IA/muscatine",
    "status": 1
  },
  {
    "id": 199,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Winnebago",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=95",
    "path": "/tax/IA/winnebago",
    "status": 1
  },
  {
    "id": 200,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Cedar",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=16",
    "path": "/tax/IA/cedar",
    "status": 1
  },
  {
    "id": 201,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Keokuk",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=54",
    "path": "/tax/IA/keokuk",
    "status": 1
  },
  {
    "id": 202,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Benton",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=6",
    "path": "/tax/IA/benton",
    "status": 1
  },
  {
    "id": 203,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Black Hawk",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=7",
    "path": "/tax/IA/black-hawk",
    "status": 1
  },
  {
    "id": 204,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Bremer",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=9",
    "path": "/tax/IA/bremer",
    "status": 1
  },
  {
    "id": 205,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Pickaway",
    "property_tax_link": "https://auditor.pickawaycountyohio.gov/",
    "path": "/tax/OH/pickaway",
    "status": 1
  },
  {
    "id": 206,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Clay",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=21",
    "path": "/tax/IA/clay",
    "status": 1
  },
  {
    "id": 207,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Cerro Gordo",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=17",
    "path": "/tax/IA/cerro-gordo",
    "status": 1
  },
  {
    "id": 208,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Clarke",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=20",
    "path": "/tax/IA/clarke",
    "status": 1
  },
  {
    "id": 209,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "O Brien",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=71",
    "path": "/tax/IA/o-brien",
    "status": 1
  },
  {
    "id": 210,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Appanoose",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=4",
    "path": "/tax/IA/appanoose",
    "status": 1
  },
  {
    "id": 211,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Warren",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=91",
    "path": "/tax/IA/warren",
    "status": 1
  },
  {
    "id": 212,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Wayne",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=93",
    "path": "/tax/IA/wayne",
    "status": 1
  },
  {
    "id": 213,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Buena Vista",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=11",
    "path": "/tax/IA/buena-vista",
    "status": 1
  },
  {
    "id": 214,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Chickasaw",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=19",
    "path": "/tax/IA/chickasaw",
    "status": 1
  },
  {
    "id": 215,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Fayette",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=33",
    "path": "/tax/IA/fayette",
    "status": 1
  },
  {
    "id": 216,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Marlboro",
    "property_tax_link": "https://marlborocountytax.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/marlboro",
    "status": 1
  },
  {
    "id": 217,
    "state_name": "Oklahoma",
    "state_code": "OK",
    "county_name": "Cleveland",
    "property_tax_link": "https://taxes.clevelandcountytreasurer.org/AccountSearch?s=pt",
    "path": "/tax/OK/cleveland",
    "status": 1
  },
  {
    "id": 218,
    "state_name": "Hawaii",
    "state_code": "HI",
    "county_name": "Maui",
    "property_tax_link": "https://qpublic.schneidercorp.com/Application.aspx?App=MauiCountyHI&PageType=Search",
    "path": "/tax/HI/maui",
    "status": 1
  },
  {
    "id": 219,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Hamilton",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=40",
    "path": "/tax/IA/hamilton",
    "status": 1
  },
  {
    "id": 220,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Mitchell",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=66",
    "path": "/tax/IA/mitchell",
    "status": 1
  },
  {
    "id": 221,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Harrison",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=43",
    "path": "/tax/IA/harrison",
    "status": 1
  },
  {
    "id": 222,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Ida",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=47",
    "path": "/tax/IA/ida",
    "status": 1
  },
  {
    "id": 223,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Hancock",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=41",
    "path": "/tax/IA/hancock",
    "status": 1
  },
  {
    "id": 224,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Jones",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=53",
    "path": "/tax/IA/jones",
    "status": 1
  },
  {
    "id": 225,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Wapello",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=90",
    "path": "/tax/IA/wapello",
    "status": 1
  },
  {
    "id": 226,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Delaware",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=28",
    "path": "/tax/IA/delaware",
    "status": 1
  },
  {
    "id": 227,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Henry",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=44",
    "path": "/tax/IA/henry",
    "status": 1
  },
  {
    "id": 228,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Webster",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=94",
    "path": "/tax/IA/webster",
    "status": 1
  },
  {
    "id": 229,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Leon",
    "property_tax_link": "https://wwwtax2.leoncountyfl.gov/itm/PropertySearchName.aspx",
    "path": "/tax/FL/leon",
    "status": 1
  },
  {
    "id": 230,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Worth",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=98",
    "path": "/tax/IA/worth",
    "status": 1
  },
  {
    "id": 231,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Wright",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=99",
    "path": "/tax/IA/wright",
    "status": 1
  },
  {
    "id": 232,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Ringgold",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=80",
    "path": "/tax/IA/ringgold",
    "status": 1
  },
  {
    "id": 233,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Clinton",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=23",
    "path": "/tax/IA/clinton",
    "status": 1
  },
  {
    "id": 234,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Howard",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=45",
    "path": "/tax/IA/howard",
    "status": 1
  },
  {
    "id": 235,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Monroe",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=68",
    "path": "/tax/IA/monroe",
    "status": 1
  },
  {
    "id": 236,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Plymouth",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=75",
    "path": "/tax/IA/plymouth",
    "status": 1
  },
  {
    "id": 237,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Tama",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=86",
    "path": "/tax/IA/tama",
    "status": 1
  },
  {
    "id": 238,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Madison",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=61",
    "path": "/tax/IA/madison",
    "status": 1
  },
  {
    "id": 239,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Louisa",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=58",
    "path": "/tax/IA/louisa",
    "status": 1
  },
  {
    "id": 240,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Boone",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=8",
    "path": "/tax/IA/boone",
    "status": 1
  },
  {
    "id": 241,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Calhoun",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=13",
    "path": "/tax/IA/calhoun",
    "status": 1
  },
  {
    "id": 242,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Cass",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=15",
    "path": "/tax/IA/cass",
    "status": 1
  },
  {
    "id": 243,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Lyon",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=60",
    "path": "/tax/IA/lyon",
    "status": 1
  },
  {
    "id": 244,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Marion",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=63",
    "path": "/tax/IA/marion",
    "status": 1
  },
  {
    "id": 245,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Marshall",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=64",
    "path": "/tax/IA/marshall",
    "status": 1
  },
  {
    "id": 246,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Story",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=85",
    "path": "/tax/IA/story",
    "status": 1
  },
  {
    "id": 247,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Audubon",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=5",
    "path": "/tax/IA/audubon",
    "status": 1
  },
  {
    "id": 248,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Dubuque",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=31",
    "path": "/tax/IA/dubuque",
    "status": 1
  },
  {
    "id": 249,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Humboldt",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=46",
    "path": "/tax/IA/humboldt",
    "status": 1
  },
  {
    "id": 250,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Snohomish",
    "property_tax_link": "https://www.snoco.org/proptax/(S(d115ztirtxzhwxeki3n25exy))/default.aspx",
    "path": "/tax/WA/snohomish",
    "status": 1
  },
  {
    "id": 251,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "York",
    "property_tax_link": "https://onlinetaxes.yorkcountygov.com/taxes#/WildfireSearch",
    "path": "/tax/SC/york",
    "status": 1
  },
  {
    "id": 252,
    "state_name": "Nebraska",
    "state_code": "NE",
    "county_name": "Nemaha",
    "property_tax_link": "https://nebraskataxesonline.us/search.aspx?county=Nemaha",
    "path": "/tax/NE/nemaha",
    "status": 1
  },
  {
    "id": 253,
    "state_name": "Nebraska",
    "state_code": "NE",
    "county_name": "Cass",
    "property_tax_link": "https://nebraskataxesonline.us/search.aspx?county=Cass",
    "path": "/tax/NE/cass",
    "status": 1
  },
  {
    "id": 254,
    "state_name": "Nebraska",
    "state_code": "NE",
    "county_name": "Boone",
    "property_tax_link": "https://nebraskataxesonline.us/search.aspx?county=Boone",
    "path": "/tax/NE/boone",
    "status": 1
  },
  {
    "id": 255,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Fairfield",
    "property_tax_link": "https://www.fairfieldsctax.com/#/WildfireSearch",
    "path": "/tax/SC/fairfield",
    "status": 1
  },
  {
    "id": 256,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Holmes",
    "property_tax_link": "https://www.holmescountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    "path": "/tax/FL/holmes",
    "status": 1
  },
  {
    "id": 257,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Jefferson",
    "property_tax_link": "https://www.jeffersoncountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    "path": "/tax/FL/jefferson",
    "status": 1
  },
  {
    "id": 258,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Washington",
    "property_tax_link": "https://www.washingtoncountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    "path": "/tax/FL/washington",
    "status": 1
  },
  {
    "id": 259,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Baker",
    "property_tax_link": "https://www.bakertaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    "path": "/tax/FL/baker",
    "status": 1
  },
  {
    "id": 260,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Bradford",
    "property_tax_link": "https://www.bradfordtaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    "path": "/tax/FL/bradford",
    "status": 1
  },
  {
    "id": 261,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Gulf",
    "property_tax_link": "https://www.gulfcountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    "path": "/tax/FL/gulf",
    "status": 1
  },
  {
    "id": 262,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Liberty",
    "property_tax_link": "https://www.libertycountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    "path": "/tax/FL/liberty",
    "status": 1
  },
  {
    "id": 263,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Madison",
    "property_tax_link": "https://www.madisoncountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    "path": "/tax/FL/madison",
    "status": 1
  },
  {
    "id": 264,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Glades",
    "property_tax_link": "https://www.mygladescountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    "path": "/tax/FL/glades",
    "status": 1
  },
  {
    "id": 265,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Jackson",
    "property_tax_link": "https://www.jacksoncountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    "path": "/tax/FL/jackson",
    "status": 1
  },
  {
    "id": 266,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Jefferson",
    "property_tax_link": "https://trueweb.jeffcowa.us/propertyaccess/PropertySearch.aspx?cid=0",
    "path": "/tax/WA/jefferson",
    "status": 1
  },
  {
    "id": 267,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Union",
    "property_tax_link": "https://uniontreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/union",
    "status": 1
  },
  {
    "id": 268,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Lafayette",
    "property_tax_link": "https://lafayette.floridatax.us/AccountSearch?s=pt",
    "path": "/tax/FL/lafayette",
    "status": 1
  },
  {
    "id": 269,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Dixie",
    "property_tax_link": "https://dixie.floridatax.us/AccountSearch?s=pt",
    "path": "/tax/FL/dixie",
    "status": 1
  },
  {
    "id": 270,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "St. Johns",
    "property_tax_link": "https://www.stjohnstax.us/AccountSearch?s=pt",
    "path": "/tax/FL/st-johns",
    "status": 1
  },
  {
    "id": 271,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Gilchrist",
    "property_tax_link": "https://gilchrist.floridatax.us/AccountSearch?s=pt",
    "path": "/tax/FL/gilchrist",
    "status": 1
  },
  {
    "id": 272,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Suwannee",
    "property_tax_link": "https://suwannee.floridatax.us/AccountSearch?s=pt",
    "path": "/tax/FL/suwannee",
    "status": 1
  },
  {
    "id": 273,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Taylor",
    "property_tax_link": "https://taylor.floridatax.us/AccountSearch?s=pt",
    "path": "/tax/FL/taylor",
    "status": 1
  },
  {
    "id": 274,
    "state_name": "Nebraska",
    "state_code": "NE",
    "county_name": "Lancaster",
    "property_tax_link": "https://app.lincoln.ne.gov/aspx/cnty/cto/default.aspx",
    "path": "/tax/NE/lancaster",
    "status": 1
  },
  {
    "id": 275,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Bamberg",
    "property_tax_link": "https://bambergcountytreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx#/",
    "path": "/tax/SC/bamberg",
    "status": 1
  },
  {
    "id": 276,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Benton",
    "property_tax_link": "https://propertysearch.co.benton.wa.us/propertyaccess/PropertySearch.aspx?cid=0",
    "path": "/tax/WA/benton",
    "status": 1
  },
  {
    "id": 277,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Williamsburg",
    "property_tax_link": "https://williamsburgtreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/williamsburg",
    "status": 1
  },
  {
    "id": 278,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Pierce",
    "property_tax_link": "https://atip.piercecountywa.gov/app/v2/parcelSearch/search",
    "path": "/tax/WA/pierce",
    "status": 1
  },
  {
    "id": 279,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Greene",
    "property_tax_link": "https://auditor.greenecountyohio.gov/Search/Name",
    "path": "/tax/OH/greene",
    "status": 1
  },
  {
    "id": 280,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "King",
    "property_tax_link": "https://payment.kingcounty.gov/Home/Index?app=PropertyTaxes&Search=1931300910",
    "path": "/tax/WA/king",
    "status": 1
  },
  {
    "id": 281,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Scioto",
    "property_tax_link": "https://www.sciotocountytax.com/taxes.html#/WildfireSearch",
    "path": "/tax/OH/scioto",
    "status": 1
  },
  {
    "id": 282,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Dillon",
    "property_tax_link": "https://dilloncountysctaxes.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/dillon",
    "status": 1
  },
  {
    "id": 283,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Colleton",
    "property_tax_link": "https://colleton.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/colleton",
    "status": 1
  },
  {
    "id": 284,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Calhoun",
    "property_tax_link": "https://calhountreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/calhoun",
    "status": 1
  },
  {
    "id": 285,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Paulding",
    "property_tax_link": "https://www.pauldingcountyauditor.com/",
    "path": "/tax/OH/paulding",
    "status": 1
  },
  {
    "id": 286,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Miami",
    "property_tax_link": "https://www.miamicountyohioauditor.gov/",
    "path": "/tax/OH/miami",
    "status": 1
  },
  {
    "id": 287,
    "state_name": "Hawaii",
    "state_code": "HI",
    "county_name": "Kauai",
    "property_tax_link": "https://qpublic.schneidercorp.com/Application.aspx?App=KauaiCountyHI&PageType=Search",
    "path": "/tax/HI/kauai",
    "status": 1
  },
  {
    "id": 288,
    "state_name": "Hawaii",
    "state_code": "HI",
    "county_name": "Hawaii",
    "property_tax_link": "https://qpublic.schneidercorp.com/Application.aspx?AppID=1048&LayerID=23618&PageTypeID=2&PageID=9876",
    "path": "/tax/HI/hawaii",
    "status": 1
  },
  {
    "id": 289,
    "state_name": "Hawaii",
    "state_code": "HI",
    "county_name": "Honolulu",
    "property_tax_link": "https://qpublic.schneidercorp.com/Application.aspx?App=HonoluluCountyHI&PageType=Search",
    "path": "/tax/HI/honolulu",
    "status": 1
  },
  {
    "id": 290,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Carroll",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=14",
    "path": "/tax/IA/carroll",
    "status": 1
  },
  {
    "id": 291,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Crawford",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=24",
    "path": "/tax/IA/crawford",
    "status": 1
  },
  {
    "id": 292,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Des Moines",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=29",
    "path": "/tax/IA/des-moines",
    "status": 1
  },
  {
    "id": 293,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Pocahontas",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=76",
    "path": "/tax/IA/pocahontas",
    "status": 1
  },
  {
    "id": 294,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Sioux",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=84",
    "path": "/tax/IA/sioux",
    "status": 1
  },
  {
    "id": 295,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Van Buren",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=89",
    "path": "/tax/IA/van-buren",
    "status": 1
  },
  {
    "id": 296,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Grundy",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=38",
    "path": "/tax/IA/grundy",
    "status": 1
  },
  {
    "id": 297,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Guthrie",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=39",
    "path": "/tax/IA/guthrie",
    "status": 1
  },
  {
    "id": 298,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Jasper",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=50",
    "path": "/tax/IA/jasper",
    "status": 1
  },
  {
    "id": 299,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Jefferson",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=51",
    "path": "/tax/IA/jefferson",
    "status": 1
  },
  {
    "id": 300,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Lee",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=56",
    "path": "/tax/IA/lee",
    "status": 1
  },
  {
    "id": 301,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Lucas",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=59",
    "path": "/tax/IA/lucas",
    "status": 1
  },
  {
    "id": 302,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Winneshiek",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=96",
    "path": "/tax/IA/winneshiek",
    "status": 1
  },
  {
    "id": 303,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Dallas",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=25",
    "path": "/tax/IA/dallas",
    "status": 1
  },
  {
    "id": 304,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Page",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=73",
    "path": "/tax/IA/page",
    "status": 1
  },
  {
    "id": 305,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Washington",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=92",
    "path": "/tax/IA/washington",
    "status": 1
  },
  {
    "id": 306,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Emmet",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=32",
    "path": "/tax/IA/emmet",
    "status": 1
  },
  {
    "id": 307,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Franklin",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=35",
    "path": "/tax/IA/franklin",
    "status": 1
  },
  {
    "id": 308,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Monona",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=67",
    "path": "/tax/IA/monona",
    "status": 1
  },
  {
    "id": 309,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Woodbury",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=97",
    "path": "/tax/IA/woodbury",
    "status": 1
  },
  {
    "id": 310,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Fayette",
    "property_tax_link": "https://www.fayettecountytreasurer.org/Search/Owner",
    "path": "/tax/OH/fayette",
    "status": 1
  },
  {
    "id": 311,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Erie",
    "property_tax_link": "https://auditor.eriecounty.oh.gov/Search/Name",
    "path": "/tax/OH/erie",
    "status": 1
  },
  {
    "id": 312,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Brown",
    "property_tax_link": "https://realestate.browncountyauditor.org/",
    "path": "/tax/OH/brown",
    "status": 1
  },
  {
    "id": 313,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Clinton",
    "property_tax_link": "https://clintoncountyauditor.org/Search/Location",
    "path": "/tax/OH/clinton",
    "status": 1
  },
  {
    "id": 314,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Seneca",
    "property_tax_link": "https://senecacountytreasurer.org/Search",
    "path": "/tax/OH/seneca",
    "status": 1
  },
  {
    "id": 315,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Logan",
    "property_tax_link": "https://treasurer.logancountyohio.gov/Search/Location",
    "path": "/tax/OH/logan",
    "status": 1
  },
  {
    "id": 316,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Tuscarawas",
    "property_tax_link": "https://treasurer.co.tuscarawas.oh.us/Search/Owner",
    "path": "/tax/OH/tuscarawas",
    "status": 1
  },
  {
    "id": 317,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Belmont",
    "property_tax_link": "https://www.belmontcountytreasurer.org/",
    "path": "/tax/OH/belmont",
    "status": 1
  },
  {
    "id": 318,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Osceola",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=72",
    "path": "/tax/IA/osceola",
    "status": 1
  },
  {
    "id": 319,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Palo Alto",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=74",
    "path": "/tax/IA/palo-alto",
    "status": 1
  },
  {
    "id": 320,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Pottawattamie",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=78",
    "path": "/tax/IA/pottawattamie",
    "status": 1
  },
  {
    "id": 321,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Union",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=88",
    "path": "/tax/IA/union",
    "status": 1
  },
  {
    "id": 322,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Jackson",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=49",
    "path": "/tax/IA/jackson",
    "status": 1
  },
  {
    "id": 323,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Adair",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=1",
    "path": "/tax/IA/adair",
    "status": 1
  },
  {
    "id": 324,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Decatur",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=27",
    "path": "/tax/IA/decatur",
    "status": 1
  },
  {
    "id": 325,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Fremont",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=36",
    "path": "/tax/IA/fremont",
    "status": 1
  },
  {
    "id": 326,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Greene",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=37",
    "path": "/tax/IA/greene",
    "status": 1
  },
  {
    "id": 327,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Mills",
    "property_tax_link": "https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=65",
    "path": "/tax/IA/mills",
    "status": 1
  },
  {
    "id": 328,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "McCormick",
    "property_tax_link": "https://mccormicktreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/mccormick",
    "status": 1
  },
  {
    "id": 329,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Newberry",
    "property_tax_link": "https://newberrytreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/newberry",
    "status": 1
  },
  {
    "id": 330,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Clark",
    "property_tax_link": "https://clarkcountyauditor.org/",
    "path": "/tax/OH/clark",
    "status": 1
  },
  {
    "id": 331,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Gallia",
    "property_tax_link": "https://auditor.gallianet.net/",
    "path": "/tax/OH/gallia",
    "status": 1
  },
  {
    "id": 332,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Athens",
    "property_tax_link": "https://www.athenscountyauditor.org/Search",
    "path": "/tax/OH/athens",
    "status": 1
  },
  {
    "id": 333,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Hocking",
    "property_tax_link": "https://beacon.schneidercorp.com/Application.aspx?App=HockingCountyOH&PageType=Search",
    "path": "/tax/OH/hocking",
    "status": 1
  },
  {
    "id": 334,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Abbeville",
    "property_tax_link": "https://abbevilletreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx?id=51662F6D-CABE-471A-8702-6840B199609F",
    "path": "/tax/SC/abbeville",
    "status": 1
  },
  {
    "id": 335,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Chesterfield",
    "property_tax_link": "https://chesterfieldcountytax.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/chesterfield",
    "status": 1
  },
  {
    "id": 336,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Spartanburg",
    "property_tax_link": "https://spartanburgcountytax.qpaybill.com/Taxes/TaxesDefaultType4.aspx#/WildfireSearch",
    "path": "/tax/SC/spartanburg",
    "status": 1
  },
  {
    "id": 337,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Barnwell",
    "property_tax_link": "https://barnwelltreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/barnwell",
    "status": 1
  },
  {
    "id": 338,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Allendale",
    "property_tax_link": "https://allendaletreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/allendale",
    "status": 1
  },
  {
    "id": 339,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Horry",
    "property_tax_link": "https://horrycountytreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/horry",
    "status": 1
  },
  {
    "id": 340,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Cherokee",
    "property_tax_link": "https://cherokeecountysctax.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/cherokee",
    "status": 1
  },
  {
    "id": 341,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Sumter",
    "property_tax_link": "https://sumtercounty.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/sumter",
    "status": 1
  },
  {
    "id": 342,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Darlington",
    "property_tax_link": "https://darlingtontreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/darlington",
    "status": 1
  },
  {
    "id": 343,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Kershaw",
    "property_tax_link": "https://kershawcounty.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/kershaw",
    "status": 1
  },
  {
    "id": 344,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Laurens",
    "property_tax_link": "https://laurenstreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/laurens",
    "status": 1
  },
  {
    "id": 345,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Wayne",
    "property_tax_link": "https://waynecountyauditor.org/Search",
    "path": "/tax/OH/wayne",
    "status": 1
  },
  {
    "id": 346,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Sandusky",
    "property_tax_link": "https://beacon.schneidercorp.com/Application.aspx?AppID=1101&LayerID=27241&PageTypeID=2&PageID=11060",
    "path": "/tax/OH/sandusky",
    "status": 1
  },
  {
    "id": 347,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Oconee",
    "property_tax_link": "https://oconeesctax.com/#/WildfireSearch",
    "path": "/tax/SC/oconee",
    "status": 1
  },
  {
    "id": 348,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Lexington",
    "property_tax_link": "https://lexingtoncountytreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/lexington",
    "status": 1
  },
  {
    "id": 349,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Saluda",
    "property_tax_link": "https://saludacountytreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/saluda",
    "status": 1
  },
  {
    "id": 350,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Lancaster",
    "property_tax_link": "https://lancastersctax.qpaybill.com/Taxes/TaxesDefaultType4.aspx#/WildfireSearch",
    "path": "/tax/SC/lancaster",
    "status": 1
  },
  {
    "id": 351,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Clarendon",
    "property_tax_link": "https://clarendoncountysctax.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/clarendon",
    "status": 1
  },
  {
    "id": 352,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Clallam",
    "property_tax_link": "https://websrv22.clallam.net/propertyaccess/?cid=0",
    "path": "/tax/WA/clallam",
    "status": 1
  },
  {
    "id": 353,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Hardee",
    "property_tax_link": "https://www.hardeecountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    "path": "/tax/FL/hardee",
    "status": 1
  },
  {
    "id": 354,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "DeSoto",
    "property_tax_link": "https://www.desotocountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    "path": "/tax/FL/desoto",
    "status": 1
  },
  {
    "id": 355,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Okeechobee",
    "property_tax_link": "https://okeechobeecountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    "path": "/tax/FL/okeechobee",
    "status": 1
  },
  {
    "id": 356,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Wakulla",
    "property_tax_link": "https://www.wakullacountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    "path": "/tax/FL/wakulla",
    "status": 1
  },
  {
    "id": 357,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Franklin",
    "property_tax_link": "https://www.franklincountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    "path": "/tax/FL/franklin",
    "status": 1
  },
  {
    "id": 358,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Hamilton",
    "property_tax_link": "https://www.hamiltoncountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    "path": "/tax/FL/hamilton",
    "status": 1
  },
  {
    "id": 359,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Calhoun",
    "property_tax_link": "https://www.calhouncountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    "path": "/tax/FL/calhoun",
    "status": 1
  },
  {
    "id": 360,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Union",
    "property_tax_link": "https://www.unioncountytc.com/Property/SearchSelect?Accept=true&ClearData=True",
    "path": "/tax/FL/union",
    "status": 1
  },
  {
    "id": 361,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Mahoning",
    "property_tax_link": "https://mahoningoh-auditor.pivotpoint.us/Search",
    "path": "/tax/OH/mahoning",
    "status": 1
  },
  {
    "id": 362,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Lee",
    "property_tax_link": "https://leetreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/lee",
    "status": 1
  },
  {
    "id": 363,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Edgefield",
    "property_tax_link": "https://edgefieldcountysc.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/edgefield",
    "status": 1
  },
  {
    "id": 364,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Spokane",
    "property_tax_link": "https://cp.spokanecounty.org/scout/SCOUTDashboard/",
    "path": "/tax/WA/spokane",
    "status": 1
  },
  {
    "id": 365,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "San Miguel",
    "property_tax_link": "https://onlinepayments.sanmiguelcountyco.gov/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/san-miguel",
    "status": 1
  },
  {
    "id": 366,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Mesa",
    "property_tax_link": "https://appz.mesacounty.us/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/mesa",
    "status": 1
  },
  {
    "id": 367,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Garfield",
    "property_tax_link": "https://act.garfield-county.com/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/garfield",
    "status": 1
  },
  {
    "id": 368,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Clear Creek",
    "property_tax_link": "https://treasurer.co.clear-creek.co.us/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/clear-creek",
    "status": 1
  },
  {
    "id": 369,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Montrose",
    "property_tax_link": "https://treasurerweb.montrosecounty.net/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/montrose",
    "status": 1
  },
  {
    "id": 370,
    "state_name": "Nebraska",
    "state_code": "NE",
    "county_name": "Douglas",
    "property_tax_link": "https://payments.dctreasurer.org/search.xhtml",
    "path": "/tax/NE/douglas",
    "status": 1
  },
  {
    "id": 371,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Levy",
    "property_tax_link": "https://levyitm.wfbsusa.com/PropertySearchName.aspx",
    "path": "/tax/FL/levy",
    "status": 1
  },
  {
    "id": 372,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Marion",
    "property_tax_link": "https://www.mariontax.com/itm/PropertySearchAccount.aspx",
    "path": "/tax/FL/marion",
    "status": 1
  },
  {
    "id": 373,
    "state_name": "Oregon",
    "state_code": "OR",
    "county_name": "Jackson",
    "property_tax_link": "https://apps.jacksoncountyor.gov/pso/",
    "path": "/tax/OR/jackson",
    "status": 1
  },
  {
    "id": 374,
    "state_name": "Oregon",
    "state_code": "OR",
    "county_name": "Jefferson",
    "property_tax_link": "https://query.co.jefferson.or.us/PSO",
    "path": "/tax/OR/jefferson",
    "status": 1
  },
  {
    "id": 375,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Moffat",
    "property_tax_link": "http://moffat.visualgov.com/SearchSelect.aspx",
    "path": "/tax/CO/moffat",
    "status": 1
  },
  {
    "id": 376,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Whitman",
    "property_tax_link": "http://terrascan.whitmancounty.net/Taxsifter/Search/Results.aspx",
    "path": "/tax/WA/whitman",
    "status": 1
  },
  {
    "id": 377,
    "state_name": "Oregon",
    "state_code": "OR",
    "county_name": "Deschutes",
    "property_tax_link": "https://dial.deschutes.org/search/situs",
    "path": "/tax/OR/deschutes",
    "status": 1
  },
  {
    "id": 378,
    "state_name": "Alabama",
    "state_code": "AL",
    "county_name": "Jackson",
    "property_tax_link": "https://jacksonproperty.countygovservices.com/Property/Search",
    "path": "/tax/AL/jackson",
    "status": 1
  },
  {
    "id": 379,
    "state_name": "Alabama",
    "state_code": "AL",
    "county_name": "Madison",
    "property_tax_link": "https://madisonproperty.countygovservices.com/Property/Property/Search",
    "path": "/tax/AL/madison",
    "status": 1
  },
  {
    "id": 380,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Island",
    "property_tax_link": "http://assessor.islandcountywa.gov/propertyaccess/?cid=0",
    "path": "/tax/WA/island",
    "status": 1
  },
  {
    "id": 381,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Whatcom",
    "property_tax_link": "https://property.whatcomcounty.us/propertyaccess/?cid=0",
    "path": "/tax/WA/whatcom",
    "status": 1
  },
  {
    "id": 382,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Stevens",
    "property_tax_link": "https://propertysearch.trueautomation.com/PropertyAccess/?cid=0",
    "path": "/tax/WA/stevens",
    "status": 1
  },
  {
    "id": 383,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Walla Walla",
    "property_tax_link": "https://propertysearch.co.walla-walla.wa.us/PropertyAccess/propertysearch.aspx?cid=0",
    "path": "/tax/WA/walla-walla",
    "status": 1
  },
  {
    "id": 384,
    "state_name": "Oregon",
    "state_code": "OR",
    "county_name": "Lake",
    "property_tax_link": "https://records.lakecountyor.org/pso",
    "path": "/tax/OR/lake",
    "status": 1
  },
  {
    "id": 385,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Thurston",
    "property_tax_link": "https://tcproperty.co.thurston.wa.us/ascendweb/",
    "path": "/tax/WA/thurston",
    "status": 1
  },
  {
    "id": 386,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Cowlitz",
    "property_tax_link": "https://www.co.cowlitz.wa.us/1874/E-Checks-Credit-or-Debit-Card-Payments",
    "path": "/tax/WA/cowlitz",
    "status": 1
  },
  {
    "id": 387,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Guernsey",
    "property_tax_link": "https://auditor.guernseycounty.gov/Search",
    "path": "/tax/OH/guernsey",
    "status": 1
  },
  {
    "id": 388,
    "state_name": "Arizona",
    "state_code": "AZ",
    "county_name": "Yuma",
    "property_tax_link": "https://yumacountyaz-tsrweb.tylerhost.net/treasurer/treasurerweb/search.jsp",
    "path": "/tax/AZ/yuma",
    "status": 1
  },
  {
    "id": 389,
    "state_name": "Arizona",
    "state_code": "AZ",
    "county_name": "Mohave",
    "property_tax_link": "https://eagletw.mohavecounty.us/treasurer/treasurerweb/search.jsp",
    "path": "/tax/AZ/mohave",
    "status": 1
  },
  {
    "id": 390,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Hampton",
    "property_tax_link": "https://hamptoncountytax.org/taxes.html#/WildfireSearch",
    "path": "/tax/SC/hampton",
    "status": 1
  },
  {
    "id": 391,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Aiken",
    "property_tax_link": "https://www.aikencountysctax.com/#/WildfireSearch",
    "path": "/tax/SC/aiken",
    "status": 1
  },
  {
    "id": 392,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Orangeburg",
    "property_tax_link": "https://orangeburgtreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    "path": "/tax/SC/orangeburg",
    "status": 1
  },
  {
    "id": 393,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Pickens",
    "property_tax_link": "https://pickenscountysctax.us/taxes.html#/WildfireSearch",
    "path": "/tax/SC/pickens",
    "status": 1
  },
  {
    "id": 394,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Chester",
    "property_tax_link": "https://www.chestercountysctax.com/taxes.html#/WildfireSearch",
    "path": "/tax/SC/chester",
    "status": 1
  },
  {
    "id": 395,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Washington",
    "property_tax_link": "https://auditorwashingtoncountyohio.gov/Search",
    "path": "/tax/OH/washington",
    "status": 1
  },
  {
    "id": 396,
    "state_name": "Arizona",
    "state_code": "AZ",
    "county_name": "Pima",
    "property_tax_link": "https://www.to.pima.gov/",
    "path": "/tax/AZ/pima",
    "status": 1
  },
  {
    "id": 397,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Poweshiek",
    "property_tax_link": "https://beacon.schneidercorp.com/Application.aspx?AppID=135&LayerID=1603&PageTypeID=2&PageID=838",
    "path": "/tax/IA/poweshiek",
    "status": 1
  },
  {
    "id": 398,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Vinton",
    "property_tax_link": "https://www.vintoncountyauditor.org/",
    "path": "/tax/OH/vinton",
    "status": 1
  },
  {
    "id": 399,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Trumbull",
    "property_tax_link": "https://property.co.trumbull.oh.us/",
    "path": "/tax/OH/trumbull",
    "status": 1
  },
  {
    "id": 400,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Polk",
    "property_tax_link": "https://polk.payfltaxes.com/lookup/property-tax",
    "path": "/tax/FL/polk",
    "status": 1
  },
  {
    "id": 401,
    "state_name": "Arizona",
    "state_code": "AZ",
    "county_name": "Cochise",
    "property_tax_link": "https://parcelinquiry.azurewebsites.us/",
    "path": "/tax/AZ/cochise",
    "status": 1
  },
  {
    "id": 402,
    "state_name": "Delaware",
    "state_code": "DE",
    "county_name": "Kent",
    "property_tax_link": "https://pride.kentcountyde.gov/",
    "path": "/tax/DE/kent",
    "status": 1
  },
  {
    "id": 403,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Knox",
    "property_tax_link": "https://beacon.schneidercorp.com/Application.aspx?AppID=1124&LayerID=28285&PageTypeID=2&PageID=11640&KeyValue=27-00076.000",
    "path": "/tax/OH/knox",
    "status": 1
  },
  {
    "id": 404,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Adams",
    "property_tax_link": "https://www.adamscountyauditor.org/Home.aspx",
    "path": "/tax/OH/adams",
    "status": 1
  },
  {
    "id": 405,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Williams",
    "property_tax_link": "http://realestate.williamscountyoh.gov/",
    "path": "/tax/OH/williams",
    "status": 1
  },
  {
    "id": 406,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Montgomery",
    "property_tax_link": "https://go.mcohio.org/applications/treasurer/search/index.cfm",
    "path": "/tax/OH/montgomery",
    "status": 1
  },
  {
    "id": 407,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Allen",
    "property_tax_link": "https://beacon.schneidercorp.com/Application.aspx?App=AllenCountyOH&PageType=Search",
    "path": "/tax/OH/allen",
    "status": 1
  },
  {
    "id": 408,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Highland",
    "property_tax_link": "https://beacon.schneidercorp.com/Application.aspx?AppID=1116&LayerID=28103&PageTypeID=2&PageID=11527",
    "path": "/tax/OH/highland",
    "status": 1
  },
  {
    "id": 409,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Portage",
    "property_tax_link": "https://beacon.schneidercorp.com/Application.aspx?App=PortageCountyOH&LayerID=30592&PageTypeID=2&PageID=12390",
    "path": "/tax/OH/portage",
    "status": 1
  },
  {
    "id": 410,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Florence",
    "property_tax_link": "https://web.florenceco.org/cgi-bin/ta/tax-inq.cgi.jic",
    "path": "/tax/SC/florence",
    "status": 1
  },
  {
    "id": 411,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Georgetown",
    "property_tax_link": "https://georgetowncountysctax.com/update.html#/WildfireSearch",
    "path": "/tax/SC/georgetown",
    "status": 1
  },
  {
    "id": 412,
    "state_name": "Arizona",
    "state_code": "AZ",
    "county_name": "Navajo",
    "property_tax_link": "https://apps.navajocountyaz.gov/NavajoWebPayments/PropertyInformation",
    "path": "/tax/AZ/navajo",
    "status": 1
  },
  {
    "id": 413,
    "state_name": "Utah",
    "state_code": "UT",
    "county_name": "Utah",
    "property_tax_link": "https://www.utahcounty.gov/LandRecords/AddressSearchForm.asp",
    "path": "/tax/UT/utah",
    "status": 1
  },
  {
    "id": 414,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Lawrence",
    "property_tax_link": "https://lawrencecountytreasurer.org/",
    "path": "/tax/OH/lawrence",
    "status": 1
  },
  {
    "id": 415,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Alpine",
    "property_tax_link": "https://countytaxretriever.com/counties/county/16",
    "path": "/tax/CA/alpine",
    "status": 1
  },
  {
    "id": 416,
    "state_name": "Oregon",
    "state_code": "OR",
    "county_name": "Lane",
    "property_tax_link": "https://apps.lanecounty.org/propertyaccountinformation/",
    "path": "/tax/OR/lane",
    "status": 1
  },
  {
    "id": 417,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Lorain",
    "property_tax_link": "https://loraincountyauditor.gov/",
    "path": "/tax/OH/lorain",
    "status": 1
  },
  {
    "id": 418,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Meigs",
    "property_tax_link": "https://beacon.schneidercorp.com/Application.aspx?AppID=1117&LayerID=28104&PageTypeID=2&PageID=11531",
    "path": "/tax/OH/meigs",
    "status": 1
  },
  {
    "id": 419,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Santa Clara",
    "property_tax_link": "https://santaclaracounty.telleronline.net/search/1/PropertyAddress",
    "path": "/tax/CA/santa-clara",
    "status": 1
  },
  {
    "id": 420,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Bent",
    "property_tax_link": "https://bentcountyco-treasurer.tylerhost.net/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/bent",
    "status": 1
  },
  {
    "id": 421,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Lincoln",
    "property_tax_link": "http://64.37.30.174/assessor/taxweb/search.jsp",
    "path": "/tax/CO/lincoln",
    "status": 1
  },
  {
    "id": 422,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Hancock",
    "property_tax_link": "https://beacon.schneidercorp.com/Application.aspx?AppID=1128&LayerID=28484&PageTypeID=2&PageID=11858",
    "path": "/tax/OH/hancock",
    "status": 1
  },
  {
    "id": 423,
    "state_name": "Oregon",
    "state_code": "OR",
    "county_name": "Multnomah",
    "property_tax_link": "https://multcoproptax.com/Property-Search-Subscribed",
    "path": "/tax/OR/multnomah",
    "status": 1
  },
  {
    "id": 424,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Richland",
    "property_tax_link": "https://www7.richlandcountysc.gov/TreasurerTaxInfo/Main.aspx",
    "path": "/tax/SC/richland",
    "status": 1
  },
  {
    "id": 425,
    "state_name": "Oregon",
    "state_code": "OR",
    "county_name": "Linn",
    "property_tax_link": "https://lc-helionweb.co.linn.or.us/pso/",
    "path": "/tax/OR/linn",
    "status": 1
  },
  {
    "id": 426,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Solano",
    "property_tax_link": "https://ca-solano.publicaccessnow.com/TaxCollector/TaxSearch.aspx",
    "path": "/tax/CA/solano",
    "status": 1
  },
  {
    "id": 427,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Mendocino",
    "property_tax_link": "https://ca-mendocino.publicaccessnow.com/TaxCollector/TaxSearch.aspx",
    "path": "/tax/CA/mendocino",
    "status": 1
  },
  {
    "id": 428,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Inyo",
    "property_tax_link": "https://ca-inyo.publicaccessnow.com/Treasurer/TaxSearch.aspx",
    "path": "/tax/CA/inyo",
    "status": 1
  },
  {
    "id": 429,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Sutter",
    "property_tax_link": "https://ca-sutter.publicaccessnow.com/TaxCollector/TaxSearch.aspx",
    "path": "/tax/CA/sutter",
    "status": 1
  },
  {
    "id": 430,
    "state_name": "Nevada",
    "state_code": "NV",
    "county_name": "Douglas",
    "property_tax_link": "https://douglasnv-search.gsacorp.io/search",
    "path": "/tax/NV/douglas",
    "status": 1
  },
  {
    "id": 431,
    "state_name": "Nevada",
    "state_code": "NV",
    "county_name": "Lyon",
    "property_tax_link": "https://gsaportal.lyon-county.org/#tab-search-tax",
    "path": "/tax/NV/lyon",
    "status": 1
  },
  {
    "id": 432,
    "state_name": "Oregon",
    "state_code": "OR",
    "county_name": "Clatsop",
    "property_tax_link": "https://apps.clatsopcounty.gov/property/",
    "path": "/tax/OR/clatsop",
    "status": 1
  },
  {
    "id": 433,
    "state_name": "Nevada",
    "state_code": "NV",
    "county_name": "Carson City",
    "property_tax_link": "https://carsoncitynv.devnetwedge.com/",
    "path": "/tax/NV/carson-city",
    "status": 1
  },
  {
    "id": 434,
    "state_name": "Nevada",
    "state_code": "NV",
    "county_name": "Churchill",
    "property_tax_link": "https://churchillnv.devnetwedge.com/",
    "path": "/tax/NV/churchill",
    "status": 1
  },
  {
    "id": 435,
    "state_name": "Nevada",
    "state_code": "NV",
    "county_name": "Nye",
    "property_tax_link": "https://nyenv.devnetwedge.com/",
    "path": "/tax/NV/nye",
    "status": 1
  },
  {
    "id": 436,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Skagit",
    "property_tax_link": "https://www.skagitcounty.net/Search/Property/",
    "path": "/tax/WA/skagit",
    "status": 1
  },
  {
    "id": 437,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Preble",
    "property_tax_link": "https://beacon.schneidercorp.com/Application.aspx?AppID=1125&LayerID=28338&PageTypeID=2&PageID=11805",
    "path": "/tax/OH/preble",
    "status": 1
  },
  {
    "id": 438,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Highlands",
    "property_tax_link": "https://property.highlands.tax/ptaxweb/",
    "path": "/tax/FL/highlands",
    "status": 1
  },
  {
    "id": 442,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Okanogan",
    "property_tax_link": "https://okanoganwa-taxsifter.publicaccessnow.com/Search/Results.aspx",
    "path": "/tax/WA/okanogan",
    "status": 1
  },
  {
    "id": 443,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Franklin",
    "property_tax_link": "http://terra.co.franklin.wa.us/TaxSifter/Search/Results.aspx",
    "path": "/tax/WA/franklin",
    "status": 1
  },
  {
    "id": 444,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Kittitas",
    "property_tax_link": "https://taxsifter.co.kittitas.wa.us/Search/Results.aspx",
    "path": "/tax/WA/kittitas",
    "status": 1
  },
  {
    "id": 445,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Pend Oreille",
    "property_tax_link": "http://taweb.pendoreille.org/PropertyAccess/PropertySearch.aspx?cid=0",
    "path": "/tax/WA/pend-oreille",
    "status": 1
  },
  {
    "id": 446,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Wahkiakum",
    "property_tax_link": "https://apo.co.wahkiakum.wa.us/propertyaccess/?cid=0",
    "path": "/tax/WA/wahkiakum",
    "status": 1
  },
  {
    "id": 447,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Chelan",
    "property_tax_link": "https://pacs.co.chelan.wa.us/PropertyAccess/?cid=90",
    "path": "/tax/WA/chelan",
    "status": 1
  },
  {
    "id": 448,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Columbia",
    "property_tax_link": "http://64.184.153.98/PropertyAccess/PropertySearch.aspx?cid=0",
    "path": "/tax/WA/columbia",
    "status": 1
  },
  {
    "id": 449,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Grant",
    "property_tax_link": "https://propertysearch.grantcountywa.gov/propertyaccess/PropertySearch.aspx?cid=10",
    "path": "/tax/WA/grant",
    "status": 1
  },
  {
    "id": 450,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Hendry",
    "property_tax_link": "https://property.hendry.tax/ptaxweb",
    "path": "/tax/FL/hendry",
    "status": 1
  },
  {
    "id": 451,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Riverside",
    "property_tax_link": "https://ca-riverside-ttc.publicaccessnow.com/PropertySearch.aspx",
    "path": "/tax/CA/riverside",
    "status": 1
  },
  {
    "id": 452,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Berkeley",
    "property_tax_link": "https://berkeleycountysc.paystar.io/app/#/",
    "path": "/tax/SC/berkeley",
    "status": 1
  },
  {
    "id": 453,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Fairfield",
    "property_tax_link": "https://realestate.co.fairfield.oh.us/",
    "path": "/tax/OH/fairfield",
    "status": 1
  },
  {
    "id": 454,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Greenville",
    "property_tax_link": "https://www.greenvillecounty.org/appsas400/votaxqry/",
    "path": "/tax/SC/greenville",
    "status": 1
  },
  {
    "id": 455,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Lewis",
    "property_tax_link": "https://parcels.lewiscountywa.gov/",
    "path": "/tax/WA/lewis",
    "status": 1
  },
  {
    "id": 456,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Jackson",
    "property_tax_link": "https://www.jacksoncountyauditor.org/",
    "path": "/tax/OH/jackson",
    "status": 1
  },
  {
    "id": 457,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Santa Cruz",
    "property_tax_link": "https://ttc.co.santa-cruz.ca.us/taxbills/",
    "path": "/tax/CA/santa-cruz",
    "status": 1
  },
  {
    "id": 458,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Greenwood",
    "property_tax_link": "https://greenwoodco.corebtpay.com/egov/apps/bill/pay.egov?view=search;itemid=1",
    "path": "/tax/SC/greenwood",
    "status": 1
  },
  {
    "id": 459,
    "state_name": "Missouri",
    "state_code": "MO",
    "county_name": "Jefferson",
    "property_tax_link": "https://jeffersonmo.devnetwedge.com/",
    "path": "/tax/MO/jefferson",
    "status": 1
  },
  {
    "id": 460,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Chaffee",
    "property_tax_link": "https://co118.cichosting.com/CTASWebPortal/parcelSearch.aspx",
    "path": "/tax/CO/chaffee",
    "status": 1
  },
  {
    "id": 461,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "San Luis Obispo",
    "property_tax_link": "https://services.slocountytax.org/",
    "path": "/tax/CA/san-luis-obispo",
    "status": 1
  },
  {
    "id": 462,
    "state_name": "Missouri",
    "state_code": "MO",
    "county_name": "St. Louis city",
    "property_tax_link": "https://www.stlouis-mo.gov/data/address-search/",
    "path": "/tax/MO/st-louis-city",
    "status": 1
  },
  {
    "id": 463,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Columbiana",
    "property_tax_link": "https://oh-columbiana-auditor.publicaccessnow.com/quicksearch.aspx",
    "path": "/tax/OH/columbiana",
    "status": 1
  },
  {
    "id": 464,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Washington",
    "property_tax_link": "https://co313.cichosting.com/CTASWebPortal/parcelSearch.aspx",
    "path": "/tax/CO/washington",
    "status": 1
  },
  {
    "id": 465,
    "state_name": "Utah",
    "state_code": "UT",
    "county_name": "Weber",
    "property_tax_link": "https://www.webercountyutah.gov/Treasurer/",
    "path": "/tax/UT/weber",
    "status": 1
  },
  {
    "id": 466,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Dorchester",
    "property_tax_link": "https://dorchestercountytaxesonline.com/taxes.html#/WildfireSearch",
    "path": "/tax/SC/dorchester",
    "status": 1
  },
  {
    "id": 467,
    "state_name": "North Carolina",
    "state_code": "NC",
    "county_name": "Buncombe",
    "property_tax_link": "https://tax.buncombecounty.org/",
    "path": "/tax/NC/buncombe",
    "status": 1
  },
  {
    "id": 468,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Marion",
    "property_tax_link": "https://propertysearch.marioncountyohio.gov/",
    "path": "/tax/OH/marion",
    "status": 1
  },
  {
    "id": 469,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Charleston",
    "property_tax_link": "https://sc-charleston.publicaccessnow.com/RealPropertyBillSearch.aspx",
    "path": "/tax/SC/charleston",
    "status": 1
  },
  {
    "id": 470,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Cheyenne",
    "property_tax_link": "https://co1347.cichosting.com/CTASWebportal/parcelSearch.aspx",
    "path": "/tax/CO/cheyenne",
    "status": 1
  },
  {
    "id": 471,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Custer",
    "property_tax_link": "https://co1467.cichosting.com/CTASWebPortal/parcelSearch.aspx",
    "path": "/tax/CO/custer",
    "status": 1
  },
  {
    "id": 472,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Sedgwick",
    "property_tax_link": "https://co1245.cichosting.com/CTASWebportal/parcelSearch.aspx",
    "path": "/tax/CO/sedgwick",
    "status": 1
  },
  {
    "id": 473,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Yuma",
    "property_tax_link": "https://co1232.cichosting.com/CTASWebPortal/parcelSearch.aspx",
    "path": "/tax/CO/yuma",
    "status": 1
  },
  {
    "id": 474,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Ashland",
    "property_tax_link": "https://oh-ashland-auditor.publicaccessnow.com/QuickSearch.aspx",
    "path": "/tax/OH/ashland",
    "status": 1
  },
  {
    "id": 475,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Ottawa",
    "property_tax_link": "https://www.ottawacountyauditor.org/",
    "path": "/tax/OH/ottawa",
    "status": 1
  },
  {
    "id": 476,
    "state_name": "North Carolina",
    "state_code": "NC",
    "county_name": "Cumberland",
    "property_tax_link": "https://taxpwa.co.cumberland.nc.us/publicwebaccess/BillSearchResults.aspx?ClickItem=NewSearch",
    "path": "/tax/NC/cumberland",
    "status": 1
  },
  {
    "id": 477,
    "state_name": "North Carolina",
    "state_code": "NC",
    "county_name": "Forsyth",
    "property_tax_link": "http://www.co.forsyth.nc.us/Tax/taxbill.aspx",
    "path": "/tax/NC/forsyth",
    "status": 1
  },
  {
    "id": 478,
    "state_name": "North Carolina",
    "state_code": "NC",
    "county_name": "Mecklenburg",
    "property_tax_link": "https://taxbill.co.mecklenburg.nc.us/publicwebaccess/",
    "path": "/tax/NC/mecklenburg",
    "status": 1
  },
  {
    "id": 479,
    "state_name": "North Carolina",
    "state_code": "NC",
    "county_name": "Guilford",
    "property_tax_link": "https://lrcpwa.ncptscloud.com/guilford/",
    "path": "/tax/NC/guilford",
    "status": 1
  },
  {
    "id": 480,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Shelby",
    "property_tax_link": "https://realestate.shelbycountyauditors.com/Search/Name",
    "path": "/tax/OH/shelby",
    "status": 1
  },
  {
    "id": 481,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Morgan",
    "property_tax_link": "https://www.morgancountyauditor.org/",
    "path": "/tax/OH/morgan",
    "status": 1
  },
  {
    "id": 482,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Holmes",
    "property_tax_link": "https://www.holmescountyauditor.org/",
    "path": "/tax/OH/holmes",
    "status": 1
  },
  {
    "id": 483,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Huron",
    "property_tax_link": "https://beacon.schneidercorp.com/Application.aspx?App=HuronCountyOH&PageType=Search",
    "path": "/tax/OH/huron",
    "status": 1
  },
  {
    "id": 484,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Coshocton",
    "property_tax_link": "https://www.coshcoauditor.org/",
    "path": "/tax/OH/coshocton",
    "status": 1
  },
  {
    "id": 485,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Muskingum",
    "property_tax_link": "https://www.muskingumcountyauditor.org/",
    "path": "/tax/OH/muskingum",
    "status": 1
  },
  {
    "id": 486,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Champaign",
    "property_tax_link": "https://treasurer.co.champaign.oh.us/Search/Owner",
    "path": "/tax/OH/champaign",
    "status": 1
  },
  {
    "id": 487,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Medina",
    "property_tax_link": "https://www.medinacountytax.com/taxes.html#/WildfireSearch",
    "path": "/tax/OH/medina",
    "status": 1
  },
  {
    "id": 488,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Franklin",
    "property_tax_link": "https://treapropsearch.franklincountyohio.gov/",
    "path": "/tax/OH/franklin",
    "status": 1
  },
  {
    "id": 489,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Geauga",
    "property_tax_link": "https://www.geaugatax.com/taxes.html#/WildfireSearch",
    "path": "/tax/OH/geauga",
    "status": 1
  },
  {
    "id": 490,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Alameda",
    "property_tax_link": "https://propertytax.alamedacountyca.gov/search",
    "path": "/tax/CA/alameda",
    "status": 1
  },
  {
    "id": 491,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Wood",
    "property_tax_link": "https://beacon.schneidercorp.com/Application.aspx?AppID=1146&LayerID=30489&PageTypeID=2&PageID=12350",
    "path": "/tax/OH/wood",
    "status": 1
  },
  {
    "id": 492,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Morrow",
    "property_tax_link": "https://auditor.co.morrow.oh.us/",
    "path": "/tax/OH/morrow",
    "status": 1
  },
  {
    "id": 493,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Hamilton",
    "property_tax_link": "https://wedge3.hcauditor.org/",
    "path": "/tax/OH/hamilton",
    "status": 1
  },
  {
    "id": 494,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Butler",
    "property_tax_link": "https://propertysearch.bcohio.gov/forms/htmlframe.aspx?mode=content/home.htm",
    "path": "/tax/OH/butler",
    "status": 1
  },
  {
    "id": 495,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Madison",
    "property_tax_link": "https://auditor.co.madison.oh.us/Search",
    "path": "/tax/OH/madison",
    "status": 1
  },
  {
    "id": 496,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Ross",
    "property_tax_link": "https://auditor.rosscountyohio.gov/",
    "path": "/tax/OH/ross",
    "status": 1
  },
  {
    "id": 497,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Ashtabula",
    "property_tax_link": "https://auditor.ashtabulacounty.us/PT/search/commonsearch.aspx?mode=owner",
    "path": "/tax/OH/ashtabula",
    "status": 1
  },
  {
    "id": 498,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Pike",
    "property_tax_link": "https://pikeparcelsearch.appraisalresearchcorp.com/",
    "path": "/tax/OH/pike",
    "status": 1
  },
  {
    "id": 499,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Henry",
    "property_tax_link": "https://henryparcelsearch.appraisalresearchcorp.com/",
    "path": "/tax/OH/henry",
    "status": 1
  },
  {
    "id": 500,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Delaware",
    "property_tax_link": "https://treasurer.co.delaware.oh.us/payments/",
    "path": "/tax/OH/delaware",
    "status": 1
  },
  {
    "id": 501,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Monroe",
    "property_tax_link": "https://monroecountyrealestatesearch.monroecountyohio.com/",
    "path": "/tax/OH/monroe",
    "status": 1
  },
  {
    "id": 502,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Mercer",
    "property_tax_link": "https://auditor.mercercountyohio.gov/Search",
    "path": "/tax/OH/mercer",
    "status": 1
  },
  {
    "id": 503,
    "state_name": "Oregon",
    "state_code": "OR",
    "county_name": "Clackamas",
    "property_tax_link": "https://ascendweb.clackamas.us/",
    "path": "/tax/OR/clackamas",
    "status": 1
  },
  {
    "id": 504,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Arapahoe",
    "property_tax_link": "https://www.arapahoeco.gov/your_county/county_departments/treasurer/tax_search.php",
    "path": "/tax/CO/arapahoe",
    "status": 1
  },
  {
    "id": 505,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Jasper",
    "property_tax_link": "https://payments.jaspercountysc.gov/",
    "path": "/tax/SC/jasper",
    "status": 1
  },
  {
    "id": 506,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Fulton",
    "property_tax_link": "https://qpublic.schneidercorp.com/Application.aspx?App=FultonCountyOH&PageType=Search",
    "path": "/tax/OH/fulton",
    "status": 1
  },
  {
    "id": 507,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Carroll",
    "property_tax_link": "https://www.carrollcountyauditor.us/Search/Name",
    "path": "/tax/OH/carroll",
    "status": 1
  },
  {
    "id": 508,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Union",
    "property_tax_link": "https://unionparcelsearch.appraisalresearchcorp.com/",
    "path": "/tax/OH/union",
    "status": 1
  },
  {
    "id": 509,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Lucas",
    "property_tax_link": "https://icare.co.lucas.oh.us/LucasCare/search/commonsearch.aspx?mode=address",
    "path": "/tax/OH/lucas",
    "status": 1
  },
  {
    "id": 510,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Warren",
    "property_tax_link": "https://www.wcauditor.org/PropertySearch/",
    "path": "/tax/OH/warren",
    "status": 1
  },
  {
    "id": 511,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Harrison",
    "property_tax_link": "http://70.62.18.11/reaweb/re-search.php",
    "path": "/tax/OH/harrison",
    "status": 1
  },
  {
    "id": 512,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Noble",
    "property_tax_link": "http://70.62.18.11/reaweb/re-search.php",
    "path": "/tax/OH/noble",
    "status": 1
  },
  {
    "id": 513,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Jefferson",
    "property_tax_link": "https://jeffersoncountyoh.com/auditor/real-estate",
    "path": "/tax/OH/jefferson",
    "status": 1
  },
  {
    "id": 514,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Clermont",
    "property_tax_link": "https://www.clermontauditorrealestate.org/_web/search/commonsearch.aspx?mode=owner",
    "path": "/tax/OH/clermont",
    "status": 1
  },
  {
    "id": 515,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Stark",
    "property_tax_link": "https://realestate.starkcountyohio.gov/search/commonsearch.aspx?mode=realprop",
    "path": "/tax/OH/stark",
    "status": 1
  },
  {
    "id": 516,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Crawford",
    "property_tax_link": "http://realestate.crawford-co.org/re-search.php",
    "path": "/tax/OH/crawford",
    "status": 1
  },
  {
    "id": 517,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Wyandot",
    "property_tax_link": "http://realestate.co.wyandot.oh.us/re/re-search.php",
    "path": "/tax/OH/wyandot",
    "status": 1
  },
  {
    "id": 518,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Hardin",
    "property_tax_link": "https://beacon.schneidercorp.com/Application.aspx?App=HardinCountyOH&PageType=Search",
    "path": "/tax/OH/hardin",
    "status": 1
  },
  {
    "id": 519,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Cuyahoga",
    "property_tax_link": "https://myplace.cuyahogacounty.gov/",
    "path": "/tax/OH/cuyahoga",
    "status": 1
  },
  {
    "id": 520,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Auglaize",
    "property_tax_link": "https://myplace.cuyahogacounty.gov/",
    "path": "/tax/OH/auglaize",
    "status": 1
  },
  {
    "id": 521,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Lake",
    "property_tax_link": "https://auditor.lakecountyohio.gov/search/commonsearch.aspx?mode=realprop",
    "path": "/tax/OH/lake",
    "status": 1
  },
  {
    "id": 522,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Perry",
    "property_tax_link": "https://beacon.schneidercorp.com/Application.aspx?AppID=1119&LayerID=28106&PageTypeID=2&PageID=11539",
    "path": "/tax/OH/perry",
    "status": 1
  },
  {
    "id": 523,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Richland",
    "property_tax_link": "https://beacon.schneidercorp.com/Application.aspx?AppID=1067&LayerID=25465&PageTypeID=2&PageID=10347",
    "path": "/tax/OH/richland",
    "status": 1
  },
  {
    "id": 524,
    "state_name": "Ohio",
    "state_code": "OH",
    "county_name": "Summit",
    "property_tax_link": "https://propertyaccess.summitoh.net/search/commonsearch.aspx?mode=realprop",
    "path": "/tax/OH/summit",
    "status": 1
  },
  {
    "id": 525,
    "state_name": "Alabama",
    "state_code": "AL",
    "county_name": "Fayette",
    "property_tax_link": "https://www.alabamagis.com/Fayette/Frameset.cfm",
    "path": "/tax/AL/fayette",
    "status": 1
  },
  {
    "id": 526,
    "state_name": "Nevada",
    "state_code": "NV",
    "county_name": "Washoe",
    "property_tax_link": "https://nv-washoe.publicaccessnow.com/Treasurer/TaxSearch.aspx",
    "path": "/tax/NV/washoe",
    "status": 1
  },
  {
    "id": 527,
    "state_name": "Missouri",
    "state_code": "MO",
    "county_name": "Platte",
    "property_tax_link": "https://www.plattecountycollector.com/realsearch.php?PHPSESSID=fn51np5d8sj6v8non37hnegua7",
    "path": "/tax/MO/platte",
    "status": 1
  },
  {
    "id": 528,
    "state_name": "North Carolina",
    "state_code": "NC",
    "county_name": "Wake",
    "property_tax_link": "https://services.wake.gov/ptax/main/billing/",
    "path": "/tax/NC/wake",
    "status": 1
  },
  {
    "id": 529,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Anderson",
    "property_tax_link": "https://acpass.andersoncountysc.org/p_tax_search.htm",
    "path": "/tax/SC/anderson",
    "status": 1
  },
  {
    "id": 530,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Klickitat",
    "property_tax_link": "http://www.klickitatcountytreasurer.org/propertysearch.aspx",
    "path": "/tax/WA/klickitat",
    "status": 1
  },
  {
    "id": 531,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Lassen",
    "property_tax_link": "https://countytaxretriever.com/counties/county/4",
    "path": "/tax/CA/lassen",
    "status": 1
  },
  {
    "id": 532,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Sierra",
    "property_tax_link": "https://countytaxretriever.com/",
    "path": "/tax/CA/sierra",
    "status": 1
  },
  {
    "id": 533,
    "state_name": "New Mexico",
    "state_code": "NM",
    "county_name": "Bernalillo",
    "property_tax_link": "https://treasurer.bernco.gov/public.access/search/commonsearch.aspx?mode=realprop",
    "path": "/tax/NM/bernalillo",
    "status": 1
  },
  {
    "id": 534,
    "state_name": "Arizona",
    "state_code": "AZ",
    "county_name": "Apache",
    "property_tax_link": "https://eagletreasurer.co.apache.az.us:8443/treasurer/treasurerweb/search.jsp?guest=true",
    "path": "/tax/AZ/apache",
    "status": 1
  },
  {
    "id": 535,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Park",
    "property_tax_link": "https://treasurer.parkco.us:8443/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/park",
    "status": 1
  },
  {
    "id": 536,
    "state_name": "Missouri",
    "state_code": "MO",
    "county_name": "St. Louis",
    "property_tax_link": "https://revenue.stlouisco.com/IAS/",
    "path": "/tax/MO/st-louis",
    "status": 1
  },
  {
    "id": 537,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Summit",
    "property_tax_link": "https://apps.summitcountyco.gov/ACTionTreasurer/default.aspx",
    "path": "/tax/CO/summit",
    "status": 1
  },
  {
    "id": 538,
    "state_name": "Nebraska",
    "state_code": "NE",
    "county_name": "Sarpy",
    "property_tax_link": "https://apps.sarpy.gov/CaptureCZ/CAPortal/CAMA/CAPortal/CZ_MainPage.aspx#down",
    "path": "/tax/NE/sarpy",
    "status": 1
  },
  {
    "id": 539,
    "state_name": "District Of Columbia",
    "state_code": "DC",
    "county_name": "District of Columbia",
    "property_tax_link": "https://mytax.dc.gov/_/#1",
    "path": "/tax/DC/district-of-columbia",
    "status": 1
  },
  {
    "id": 540,
    "state_name": "Delaware",
    "state_code": "DE",
    "county_name": "Sussex",
    "property_tax_link": "https://munis.sussexcountyde.gov/css/citizens/RealEstate/Default.aspx?mode=new",
    "path": "/tax/DE/sussex",
    "status": 1
  },
  {
    "id": 541,
    "state_name": "Oregon",
    "state_code": "OR",
    "county_name": "Washington",
    "property_tax_link": "https://washcotax.co.washington.or.us/",
    "path": "/tax/OR/washington",
    "status": 1
  },
  {
    "id": 542,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Pueblo",
    "property_tax_link": "http://www.co.pueblo.co.us/cgi-bin/webatrallbroker.wsc/atrpropertysearchall.html",
    "path": "/tax/CO/pueblo",
    "status": 1
  },
  {
    "id": 543,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Kitsap",
    "property_tax_link": "https://psearch.kitsap.gov/pdetails/Default",
    "path": "/tax/WA/kitsap",
    "status": 1
  },
  {
    "id": 544,
    "state_name": "North Carolina",
    "state_code": "NC",
    "county_name": "Durham",
    "property_tax_link": "https://property.spatialest.com/nc/durham-tax/#/",
    "path": "/tax/NC/durham",
    "status": 1
  },
  {
    "id": 545,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Manatee",
    "property_tax_link": "https://secure.taxcollector.com/ptaxweb/",
    "path": "/tax/FL/manatee",
    "status": 1
  },
  {
    "id": 546,
    "state_name": "Alabama",
    "state_code": "AL",
    "county_name": "Tuscaloosa",
    "property_tax_link": "https://altags.com/Tuscaloosa_Revenue/property.aspx",
    "path": "/tax/AL/tuscaloosa",
    "status": 1
  },
  {
    "id": 547,
    "state_name": "Alabama",
    "state_code": "AL",
    "county_name": "Mobile",
    "property_tax_link": "https://mobile.capturecama.com/receiptsearch",
    "path": "/tax/AL/mobile",
    "status": 1
  },
  {
    "id": 548,
    "state_name": "Alabama",
    "state_code": "AL",
    "county_name": "Jefferson",
    "property_tax_link": "https://eringcapture.jccal.org/propsearch",
    "path": "/tax/AL/jefferson",
    "status": 1
  },
  {
    "id": 549,
    "state_name": "Alabama",
    "state_code": "AL",
    "county_name": "Shelby",
    "property_tax_link": "https://ptc.shelbyal.com/propsearch",
    "path": "/tax/AL/shelby",
    "status": 1
  },
  {
    "id": 550,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Gadsden",
    "property_tax_link": "https://fl-gadsden.publicaccessnow.com/TaxCollector/PropertyTaxSearch.aspx",
    "path": "/tax/FL/gadsden",
    "status": 1
  },
  {
    "id": 551,
    "state_name": "Oregon",
    "state_code": "OR",
    "county_name": "Logan",
    "property_tax_link": "https://property.spatialest.com/co/logan#/",
    "path": "/tax/OR/logan",
    "status": 1
  },
  {
    "id": 552,
    "state_name": "South Carolina",
    "state_code": "SC",
    "county_name": "Beaufort",
    "property_tax_link": "https://www.beaufortcountytreasurer.com/tax-bill-lookup",
    "path": "/tax/SC/beaufort",
    "status": 1
  },
  {
    "id": 553,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Sacramento",
    "property_tax_link": "https://eproptax.saccounty.net/#secured",
    "path": "/tax/CA/sacramento",
    "status": 1
  },
  {
    "id": 554,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "San Francisco",
    "property_tax_link": "https://county-taxes.net/ca-sanfrancisco/property-tax",
    "path": "/tax/CA/san-francisco",
    "status": 1
  },
  {
    "id": 555,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "San Mateo",
    "property_tax_link": "https://county-taxes.net/ca-sanmateo/services/property-tax",
    "path": "/tax/CA/san-mateo",
    "status": 1
  },
  {
    "id": 556,
    "state_name": "Missouri",
    "state_code": "MO",
    "county_name": "Clay",
    "property_tax_link": "https://collector.claycountymo.gov/ascend/(dggm4ibpya0yw0b3jkk1qu45)/search.aspx",
    "path": "/tax/MO/clay",
    "status": 1
  },
  {
    "id": 557,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Ventura",
    "property_tax_link": "https://ptacs-tax.countyofventura.org/webtaxonline/index.html",
    "path": "/tax/CA/ventura",
    "status": 1
  },
  {
    "id": 558,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Fresno",
    "property_tax_link": "https://fcacttcptr.fresnocountyca.gov/",
    "path": "/tax/CA/fresno",
    "status": 1
  },
  {
    "id": 559,
    "state_name": "Florida",
    "state_code": "FL",
    "county_name": "Putnam",
    "property_tax_link": "https://ptaxweb.putnamtax.com/ptaxweb/editPropertySearch2.action;jsessionid=28FC97D09BE694E3DBE27898B58D229C",
    "path": "/tax/FL/putnam",
    "status": 1
  },
  {
    "id": 560,
    "state_name": "Washington",
    "state_code": "WA",
    "county_name": "Yakima",
    "property_tax_link": "https://yes.co.yakima.wa.us/ascend/(S(0kircpceocgw4lemreweglws))/default.aspx",
    "path": "/tax/WA/yakima",
    "status": 1
  },
  {
    "id": 561,
    "state_name": "Utah",
    "state_code": "UT",
    "county_name": "Davis",
    "property_tax_link": "https://webportal.daviscountyutah.gov/App/PropertySearch/",
    "path": "/tax/UT/davis",
    "status": 1
  },
  {
    "id": 562,
    "state_name": "Utah",
    "state_code": "UT",
    "county_name": "Summit",
    "property_tax_link": "https://treasurer.summitcounty.org/treasurer/treasurerweb/search.jsp",
    "path": "/tax/UT/summit",
    "status": 1
  },
  {
    "id": 563,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Eagle",
    "property_tax_link": "https://propertytax.eaglecounty.us/PropertyTaxSearch/",
    "path": "/tax/CO/eagle",
    "status": 1
  },
  {
    "id": 564,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Gunnison",
    "property_tax_link": "https://taxsearch.gunnisoncounty.org/prod/propertytaxsearchwebsite",
    "path": "/tax/CO/gunnison",
    "status": 1
  },
  {
    "id": 565,
    "state_name": "Iowa",
    "state_code": "IA",
    "county_name": "Polk",
    "property_tax_link": "https://taxsearch.polkcountyiowa.gov/Search",
    "path": "/tax/IA/polk",
    "status": 1
  },
  {
    "id": 566,
    "state_name": "Oregon",
    "state_code": "OR",
    "county_name": "Benton",
    "property_tax_link": "https://assessment.bentoncountyor.gov/property-account-search/",
    "path": "/tax/OR/benton",
    "status": 1
  },
  {
    "id": 567,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Montezuma",
    "property_tax_link": "https://eagleweb.co.montezuma.co.us:8444/treasurer/web/login.jsp",
    "path": "/tax/CO/montezuma",
    "status": 1
  },
  {
    "id": 568,
    "state_name": "Arizona",
    "state_code": "AZ",
    "county_name": "Pinal",
    "property_tax_link": "https://treasurer.pinal.gov/parcelinquiry",
    "path": "/tax/AZ/pinal",
    "status": 1
  },
  {
    "id": 569,
    "state_name": "Oregon",
    "state_code": "OR",
    "county_name": "Klamath",
    "property_tax_link": "https://www.paydici.com/klamath-county-or/search/property-tax",
    "path": "/tax/OR/klamath",
    "status": 1
  },
  {
    "id": 570,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "El Paso",
    "property_tax_link": "https://www.paydici.com/el-paso-county-treasurer/search/tax-search-group",
    "path": "/tax/CO/el-paso",
    "status": 1
  },
  {
    "id": 571,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "San Bernardino",
    "property_tax_link": "https://www.mytaxcollector.com/trSearch.aspx",
    "path": "/tax/CA/san-bernardino",
    "status": 0
  },
  {
    "id": 572,
    "state_name": "Georgia",
    "state_code": "GA",
    "county_name": "Troup",
    "property_tax_link": "https://troupcountytax.com/",
    "path": "/tax/GA/troup",
    "status": 1
  },
  {
    "id": 573,
    "state_name": "North Carolina",
    "state_code": "NC",
    "county_name": "Henderson",
    "property_tax_link": "https://bcpwa.ncptscloud.com/hendersontax/",
    "path": "/tax/NC/henderson",
    "status": 1
  },
  {
    "id": 574,
    "state_name": "North Carolina",
    "state_code": "NC",
    "county_name": "New Hanover",
    "property_tax_link": "https://newhanovercountynccss.munisselfservice.com/citizens/RealEstate/Default.aspx?mode=new",
    "path": "/tax/NC/new-hanover",
    "status": 1
  },
  {
    "id": 575,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Kern",
    "property_tax_link": "https://www.kcttc.co.kern.ca.us/payment/MainSearch.aspx",
    "path": "/tax/CA/kern",
    "status": 1
  },
  {
    "id": 576,
    "state_name": "North Carolina",
    "state_code": "NC",
    "county_name": "Cleveland",
    "property_tax_link": "https://www.clevelandcountytaxes.com/taxes.html#/WildfireSearch",
    "path": "/tax/NC/cleveland",
    "status": 1
  },
  {
    "id": 577,
    "state_name": "North Carolina",
    "state_code": "NC",
    "county_name": "Swain",
    "property_tax_link": "https://www.bttaxpayerportal.com/ITSPublicSW/TaxBillSearch",
    "path": "/tax/NC/swain",
    "status": 1
  },
  {
    "id": 578,
    "state_name": "North Carolina",
    "state_code": "NC",
    "county_name": "Catawba",
    "property_tax_link": "https://taxbill.catawbacountync.gov/ITSPublicCT/TaxBillSearch",
    "path": "/tax/NC/catawba",
    "status": 1
  },
  {
    "id": 579,
    "state_name": "California",
    "state_code": "CA",
    "county_name": "Orange",
    "property_tax_link": "https://taxbill.octreasurer.gov/",
    "path": "/tax/CA/orange",
    "status": 1
  },
  {
    "id": 580,
    "state_name": "North Carolina",
    "state_code": "NC",
    "county_name": "Caldwell",
    "property_tax_link": "https://www.caldwellcountynctax.com/taxes.html#/WildfireSearch",
    "path": "/tax/NC/caldwell",
    "status": 1
  },
  {
    "id": 581,
    "state_name": "North Carolina",
    "state_code": "NC",
    "county_name": "Warren",
    "property_tax_link": "https://secure.webtaxpay.com/index.php?site=full&county=warren&state=NC",
    "path": "/tax/NC/warren",
    "status": 1
  },
  {
    "id": 582,
    "state_name": "North Carolina",
    "state_code": "NC",
    "county_name": "Yancey",
    "property_tax_link": "https://secure.webtaxpay.com/?county=yancey&state=NC",
    "path": "/tax/NC/yancey",
    "status": 1
  },
  {
    "id": 583,
    "state_name": "North Carolina",
    "state_code": "NC",
    "county_name": "Brunswick",
    "property_tax_link": "https://tax.brunsco.net/ITSNet/",
    "path": "/tax/NC/brunswick",
    "status": 1
  },
  {
    "id": 584,
    "state_name": "North Carolina",
    "state_code": "NC",
    "county_name": "Transylvania",
    "property_tax_link": "https://tax.transylvaniacounty.org/",
    "path": "/tax/NC/transylvania",
    "status": 1
  },
  {
    "id": 585,
    "state_name": "Georgia",
    "state_code": "GA",
    "county_name": "Glynn",
    "property_tax_link": "https://property.glynncounty-ga.gov/search/commonsearch.aspx?mode=realprop",
    "path": "/tax/GA/glynn",
    "status": 1
  },
  {
    "id": 586,
    "state_name": "North Carolina",
    "state_code": "NC",
    "county_name": "Orange",
    "property_tax_link": "https://web.co.orange.nc.us/publicwebaccess/",
    "path": "/tax/NC/orange",
    "status": 1
  },
  {
    "id": 587,
    "state_name": "North Carolina",
    "state_code": "NC",
    "county_name": "Gaston",
    "property_tax_link": "https://gastonnc.devnetwedge.com/",
    "path": "/tax/NC/gaston",
    "status": 1
  },
  {
    "id": 588,
    "state_name": "Colorado",
    "state_code": "CO",
    "county_name": "Teller",
    "property_tax_link": "https://treas.co.teller.co.us/treasurer/treasurerweb/search.jsp",
    "path": "/tax/CO/teller",
    "status": 1
  },
  {
    "id": 589,
    "state_name": "North Carolina",
    "state_code": "NC",
    "county_name": "Rockingham",
    "property_tax_link": "https://www.ustaxdata.com/nc/rockingham/rockinghamtaxsearch.cfm",
    "path": "/tax/NC/rockingham",
    "status": 1
  },
  {
    "id": 590,
    "state_name": "Georgia",
    "state_code": "GA",
    "county_name": "Pickens",
    "property_tax_link": "https://pickensproperty.assurancegov.com/Property/Search",
    "path": "/tax/GA/pickens",
    "status": 1
  }
];

export default counties;