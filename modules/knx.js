var knx = require("knx");
var dpts = require("knx/src/dptlib"); // pour utilisation fonction "dpts.fromBuffer()" qui permet de convertir données buffer KNX dans les unités du DPT correspondant
var request = require("request"); // HTTP POST vers serveur EMONCMS
var ets = require("./../ets"); // JSON export from ETS CSV export
//knx_ga_groupname
//knx_ga_address
//knx_ga_central
//knx_ga_unfiltered
//knx_ga_description
//knx_ga_datapointtype
//knx_ga_security
//knx_ga_id
//knx_ga_value
//knx_ga_dptsubtypeunit
//knx_ga_timestamp
//knx_ga_src
var dpstTodpt = function(dpst) { //DPT-9-1 (issu du CSV export d'ETS) retourne DPT9.001 (utilisable en Node KNX)
	var dpt = "DPT" + dpst.charAt(5);
	for (i = 6; i < dpst.length; i += 1) {
		if (dpst.charAt(i) == "-" && dpst.length == (i + 2)) {
			dpt = dpt + ".00";
		}
		if (dpst.charAt(i) == "-" && dpst.length == (i + 3)) {
			dpt = dpt + ".0";
		}
		if (dpst.charAt(i) == "-" && dpst.length == (i + 4)) {
			dpt = dpt + ".";
		}
		if (dpst.charAt(i) != "-") {
			dpt = dpt + dpst.charAt(i);
		}
	}
	return dpt;
};
var knxgaTodpt = function(knxga) {
	var results;
	var found = 0;
	for (i = 0; i < ets.length; i += 1) {
		if (ets[i].knx_ga_address == knxga) {
			found = 1;
			results = ets[i].knx_ga_datapointtype;
			if (results.length > 0) {
				return results;
			} else {
				console.log(new Date(), " *** knxgaTodpt : erreur adresse de groupe connue mais DPT non renseigné");
			}
		}
		if (found === 0 && i === (ets.length - 1)) {
			console.log(new Date(), " *** Fonction knxgaTodpt : erreur adresse de groupe inconnue, mettre à jour fichier ets.json avec export CSV ETS");
		}
	}
};
var knxgaToganame = function(knxga) {
	var results;
	var found = 0;
	for (i = 0; i < ets.length; i += 1) {
		if (ets[i].knx_ga_address === knxga) {
			found = 1;
			results = ets[i].knx_ga_groupname;
			if (results.length > 0) {
				return results;
			} else {
				console.log(new Date(), " *** knxgaTodpt : erreur adresse de groupe connue mais nom du groupe non renseigné");
			}
		}
		if (found === 0 && i === (ets.length - 1)) {
			console.log(new Date(), " *** Fonction knxgaToganame : erreur adresse de groupe inconnue, mettre à jour fichier ets.json avec export CSV ETS");
		}
	}
};
var insert_emoncms = function(evt, src, dest, value) {
	//console.log("****** dpstTodpt : " + dpstTodpt(knxgaTodpt(dest.toString(), ets)));
	var knxdatapoint = new knx.Datapoint({
		ga: dest.toString(),
		dpt: dpstTodpt(knxgaTodpt(dest.toString(), ets))
	});
	knxdatapoint.update(dpts.fromBuffer(value, knxdatapoint.dpt));
	var knxdatapointname = knxgaToganame(dest.toString(), ets);
	var knxdatapointunit;
	if (knxdatapoint.dpt.subtype.unit !== undefined) {
		knxdatapointunit = " (" + knxdatapoint.dpt.subtype.unit + ")";
	}
	//console.log("******* alo !!!!!!!! " + knxdatapoint.dpt.subtype.unit);
	////HTTP POST vers serveur EMONCMS
	var json = {};
	json[dest.toString().replace(/\//g, "-")] = knxdatapoint.current_value;
	//Set the headers
	var headers = {
		"content-type": "application/json"
	};
	//Configure the request
	var sendemoncms = {
		url: encodeURI("http://" + process.env.EMONCMS_HOST + "/emoncms/input/post.json?node=1&fulljson=" + JSON.stringify(json) + "&apikey=" + process.env.EMONCMS_APIKEY),
		method: "GET",
		encoding: "utf8",
		headers: headers
	};
	var getinputemoncms = {
		url: "http://" + process.env.EMONCMS_HOST + "/emoncms/input/get_inputs.json" + "&apikey=" + process.env.EMONCMS_APIKEY,
		method: "GET",
		encoding: "utf8",
		headers: headers
	};
	request(sendemoncms, function(error, response, body) {
		if (!error && response.statusCode === 200) {
			//console.log(body);
			request(getinputemoncms, function(error, response, body) {
				if (!error && response.statusCode === 200) {
					var jsongetinput = JSON.parse(body);
					var destknx = dest.toString().replace(/\//g, "-");
					var idinput = JSON.stringify(jsongetinput[1][destknx].id); // id de l"input de EMONCMS correspondant à la key (qui est elle égale au GA KNX)
					var checkdescriptionfield = {
						url: "http://" + process.env.EMONCMS_HOST + "/emoncms/input/list.json" + "&apikey=" + process.env.EMONCMS_APIKEY,
						method: "GET",
						encoding: "utf8",
						headers: headers
					};
					request(checkdescriptionfield, function(error, response, body) {
						if (!error && response.statusCode === 200) {
							var jsoncheckdescriptionfield = JSON.parse(body);
							var descriptionfield = JSON.stringify(jsoncheckdescriptionfield);
							var arraystring = descriptionfield.toString();
							var testarray = JSON.parse(arraystring);
							//console.log("**** testarray.length : "+ testarray.length);
							for (i = 0; i < testarray.length; i += 1) {
								//console.log(" ***** testarray " + JSON.stringify(testarray[i]) + " valeur de i " + i);
								//console.log(" ***** testarray " + JSON.stringify(testarray));
								if (testarray[i].description === "") {
									//console.log(" description vide pour id " + testarray[i].id);
									destmod = dest.toString().replace(/\//g, "-");
									//console.log("debug inputdescription knxmonitorcomment " + knxdatapoint.current_value);
									//console.log("input id " + testarray[i].id);
									//console.log("input name " + testarray[i].name);
									//console.log("input name " + testarray[i].name);
									//console.log("knx_ga_src " + destmod);
									//console.log("input name " + testarray[i].name);
									//console.log("knx ga name " + knxdatapointname);
									//console.log("input name " + testarray[i].name);
									//console.log("valeur de i " + i);
									//console.log("input name " + testarray[i].name);
									//console.log("input name " + testarray[i].name + " valeur de i " + i);
									if (destmod === testarray[i].name) {
										//console.log(" ******* OK destmod et testarray name identiques ******" + " valeur de i " + i);
										if (knxdatapointunit !== undefined) {
											//console.log(" ******* knxdatapointunit : " + knxdatapointunit);
											setdescriptionemoncms = {
												url: encodeURI('http://' + process.env.EMONCMS_HOST + '/emoncms/input/set.json?inputid=' + testarray[i].id + '&fields={"description":' + '"' + knxdatapointname + knxdatapointunit + '"' + '}' + '&apikey=' + process.env.EMONCMS_APIKEY),
												method: "GET",
												encoding: "utf8",
												headers: headers
											};
										} else {
											setdescriptionemoncms = {
												url: encodeURI('http://' + process.env.EMONCMS_HOST + '/emoncms/input/set.json?inputid=' + testarray[i].id + '&fields={"description":' + '"' + knxdatapointname + '"' + '}' + '&apikey=' + process.env.EMONCMS_APIKEY),
												method: "GET",
												encoding: "utf8",
												headers: headers
											};
										}
										request(setdescriptionemoncms, function(error, response, body) {
											if (!error && response.statusCode === 200) {} else {
												console.log("error: " + error)
												console.log("response.statusCode: " + response.statusCode)
												console.log("response.statusText: " + response.statusText)
											}
											//i = testarray.length;
										})
									}
								}
							}
						} else {
							console.log("error: " + error)
							//console.log("response.statusCode: " + response.statusCode)
							//console.log("response.statusText: " + response.statusText)
						}
					})
				} else {
					console.log("error: " + error)
					//console.log("response.statusCode: " + response.statusCode)
					//console.log("response.statusText: " + response.statusText)
				}
			})
		} else {
			console.log("error: " + error)
			//console.log("response.statusCode: " + response.statusCode)
			//console.log("response.statusText: " + response.statusText)
		}
	}).on('error', (e) => {
		console.error(e);
	});
		
}

exports.knxgaTodpt = knxgaTodpt;
exports.insert_emoncms = insert_emoncms;
