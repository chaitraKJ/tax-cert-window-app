import connectDB from "../db/connection.js";

const add_county_form = (req, res) => {
	try{
		res.render('county/add_county_form');
	}
	catch(error){
		console.log(error);
		return res.redirect('/login');
	}
}

const add_county = async (req, res) => {
	try{
		const { state_code, state_name, county_name, website_link, path, status } = req.body;

		if(!state_code || !state_name || !county_name || !website_link || !path || !status){
			return res.status(500).json({
				error: true,
				message: "Please fill all the input"
			});
		}

		// CHECK IF THE DATA IS ALREADY PRESENT
		const conn = await connectDB();
		const sql = `SELECT COUNT(*) AS existingCount FROM county WHERE (state_code='${state_code}' AND county_name='${county_name}') or path='${path}'`;
		const [sqlResult] = await conn.query(sql);
		const existingCount = sqlResult[0].existingCount;

		if(existingCount > 0){
			return res.status(500).json({
				error: true,
				message: "State and County already exists"
			}); 
		}

		// INSERT NEW DATA TO DATABASE
		const insertQuery = `INSERT INTO county(state_name, state_code, county_name, property_tax_link, path, status) VALUES ('${state_name}', '${state_code}', '${county_name}', '${website_link}', '${path}', '${status}')`;
		const [result] = await conn.query(insertQuery);
		await conn.end();

		return res.status(200).json({
			status: true,
			message: "County data successfully added"
		});
		
	}
	catch(error){
		console.log(error);
		return res.status(500).json({
			error: true,
			message: error.message
		})
	}
}

const edit_county = async (req, res) => {
	try{
		const { state_code, state_name, county_name, website_link, path, status } = req.body;
		const county_id = req.params.id;

		if(county_id == "" || state_code == "" || state_name == "" || county_name == "" || website_link == "" || path == "" || status == ""){
			return res.status(500).json({
				error: true,
				message: "Please fill all the input"
			});
		}

		// UPDATE DATA TO DATABASE
		const conn = await connectDB();
		const updateQuery = `UPDATE county SET state_name='${state_name}', state_code='${state_code}',county_name='${county_name}', property_tax_link='${website_link}', path='${path}', status='${status}' WHERE id='${county_id}'`;
		const [result] = await conn.query(updateQuery);
		await conn.end();

		return res.status(200).json({
			status: true,
			message: "County data successfully updated"
		});

	}
	catch(error){
		console.log(error);
		return res.status(400).json({
			error: true,
			message: error.message
		})
	}
}

const delete_county = async (req, res) => {
	try{
		const county_id  = req.params.id;

		if(county_id == ""){
			return res.status(500).json({
				error: true,
				message: "Something went wrong, Please try again later"
			});
		}

		// UPDATE DATA TO DATABASE
		const conn = await connectDB();
		const deleteQuery = `DELETE FROM county WHERE id='${county_id}'`;
		const [result] = await conn.query(deleteQuery);
		await conn.end();

		return res.status(200).json({
			status: true,
			message: "County data successfully deleted"
		});	

	}
	catch(error){
		console.log(error);
		return res.status(500).json({
			error: true,
			message: error.message
		})
	}
}

const get_all_live_counties_display = async (req, res) => {
	try{
		res.render('county/display_live_county');

	}
	catch(error){
		console.log(error);
		return res.redirect('/login');
	}
}

const get_all_live_counties = async (req, res) => {
	try{

		// GET ALL COUNTY DATA FROM DATABASE
		const conn = await connectDB();
		const deleteQuery = `SELECT id, state_code, county_name FROM county WHERE status=1 ORDER BY state_name, county_name`;
		const [result] = await conn.query(deleteQuery);
		await conn.end();

		return res.status(200).json({
			status: true,
			message: result
		});	

	}
	catch(error){
		console.log(error);
		return res.redirect('/login');
	}
}

export {
	add_county_form,
	add_county,
	edit_county,
	delete_county,
	get_all_live_counties_display,
	get_all_live_counties
}