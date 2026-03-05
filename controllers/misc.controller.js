import counties from "./county.js";

const getCounty = async (req, res) => {
	const { state } = req.query;
	if(!state){
		return res.status(400).json({
			error: "State value is missing"
		});
	}

	try{
		let result = [];
		counties.forEach((county, i) => {
			if(county['state_code'] == state && county['status'] == 1){
				result.push({
					county: county['county_name'],
					path: county['path']
				});
			}
		});
		return res.status(200).json({
			data: result
		});
	}
	catch(error){
		console.log(error.message);
		return res.status(500).json({
			error: error.message
		});
	}
}

export {
	getCounty
};