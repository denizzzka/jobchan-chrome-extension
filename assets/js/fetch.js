const requester = {
	api: 'https://jbchan.mooo.com:8351',

	request: async ( args, post_args ) => {
		let res;

		if( Object.keys( args ).length ){
			const params = new URLSearchParams();

			params.append('api', '1.0');

			for( const key in args ){
				if( args.hasOwnProperty( key ) )
					params.append(key, args[ key ] );
			}
			const query = params.toString();

			let url = requester.api +'?'+ query;

			if( Object.keys( post_args ).length == 0 ){
				res = await fetch(
					url,
					{
						credentials: "include"
					}
				);
			}
			else{
				res = await fetch(
					url,
					{
						method: "POST",
						headers: {
							"Content-type": "application/json; charset=UTF-8",
							"Accept":		"application/json; charset=UTF-8"
						},
						credentials: "include",
						body: JSON.stringify(
							Object.assign(post_args)
						)
					}
				);
			}
		}

		if( ! res.ok )
			throw new Error('Request error: '+ res.status );

		return await res.json();
	}
}
