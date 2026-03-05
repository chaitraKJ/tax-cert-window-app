const companies = [
  {
    name: "ACCURATE",
    noOfYearsWanted: 2,
  },
  {
    name: "OTHERS",
    noOfYearsWanted: 1,
  },
];


export const getOHCompanyYears = (companyName) => {
  if (!companyName) return 1;

  const company = companies.find(
    (c) => c.name.toLowerCase() === companyName.toLowerCase()
  );

  return company?.noOfYearsWanted || 1;
};

export default companies;

