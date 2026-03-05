const client_config = {
	'accurate' : 2,
	'others' : 1
};

const get_client_years = (client) => {
	try{
		if(!client){
			return client_config['others'];
		}
		client = client.toLowerCase();
		if(client_config[client]){
			return client_config[client];
		}
		return client_config['others'];
	}
	catch(error){
		console.log(error);
		return client_config['others'];
	}
}

export default get_client_years;