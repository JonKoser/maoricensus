//global variables
var keyArray = ["PctNoTel","PctSpkMao","MaSpkOnMa","PctMaRelig",
                "MedIncMao","MedIncome","PctMaori","Total_Pop"]
var expressed = keyArray[0] //initial attribute
var recolorPoly; //function to recolor the given polygons
var width = 620, height = 620; //map width and heights
var chartWidth = 640, chartHeight = 300; //bar chart width and heights
var quantiles; //quantile break points for choropleth
var xArray = [145, 205, 265, 325, 385]; //x coordinates for legend boxes
var popWidth = 640
var popHeight = 300
var popBarWidth = Math.floor(popWidth/18) - 1;
var popRange = []; //array of total pop values for one district
var distVals = []; //array of all the objects for a single district
var currentDist; //district selected
var popAges; //create a variable to contain the population csv data


//begin script when window loads
window.onload = initialize();

//the first function called once the html is loaded
function initialize() {
    setMap();
};

//set choropleth map parameters
function setMap () {

    
    //create a new svg element with the above dimensions
    var map = d3.select("body")
            .append("svg")
            .attr("class", "map")
            .attr("width", width)
            .attr("height", height);
    
    
    //create New Zealand Transverse Mercator projection
    var projection = d3.geo.transverseMercator()
            .rotate([-175, 41])
            .translate([width/2, height/2])
            .scale(2500);
    
        
    //creat svg path generator using the projection
    var path = d3.geo.path()
            .projection(projection);  
    
    
    //create graticule generator
    var graticule = d3.geo.graticule()
            .step([5, 5]); //place graticule lines every 5 degrees
    
    //create graticule background
    var gratBackground = map.append("path")
            .datum(graticule.outline) //bind graticule background
            .attr("class", "gratBackground") //assign class for styling
            .attr("d", path)
            .on("click", changeDist); //project graticule
    
    //create craticule lines
    var gratLines = map.selectAll(".gratLines") //select graticule elements
            .data(graticule.lines) //bind graticule lines to each element
            .enter() //create an element for each datum
            .append("path") //append each element to the svg as a path element
            .attr("class", "gratLines") //assigns class for styling
            .attr("d", path); //project graticule lines

    
    
    //use queue.js to parallelise asynchronous data loading
    queue()
        .defer(d3.csv, "data/NewZealand.csv") //load attributes from csv
        .defer(d3.json, "data/NZ_Districts.topojson") //load geometry from topojson
        .defer(d3.csv, "data/population_ages.csv") //load population data
        .await(callback); //trigger callback function once data is loaded
   
    //retrieve and process NZ json file and data
    function callback(error, csvData, NZ_Districts, popCSV) {
        recolorPoly = colorScale(csvData); //a color scale is generated from the entire set of data
        
        popAges = popCSV;
        //variables for csv to json data transfer
        var jsonDists = NZ_Districts.objects.New_Zealand_Districts.geometries;
        
        //loop through csv to assign each csv values to json district
        for (var i = 0; i < csvData.length; i++) {
            var csvDist = csvData[i]; //the current district
            var csvTA2014 = csvDist.TA2014; //TA Code
            
            //loop through json provinces to find right district
            for (var j = 0; j < jsonDists.length; j++) {
                //where names match, attach csv to json object
                if (jsonDists[j].properties.TA2014 == csvTA2014) {
                    
                    //assign all key/value pairs
                    for (var key in keyArray) {
                        var attr = keyArray[key];
                        var val = parseFloat(csvDist[attr])
                        jsonDists[j].properties[attr] = val;
                    };
                break; //stop looking through the json districts
                };
            };
        };

        
        //add districts to map as enumeration units colored by data
        var districts = map.selectAll(".districts") 
                .data(topojson.feature(NZ_Districts,
                                        NZ_Districts.objects.New_Zealand_Districts).features)
                .enter() //create elements
                .append("g") //give each district its own g element
                .attr("class", "districts") //assign class for styling
                .append("path")
                .attr("class", function(d) {return d.properties.TA2014})
                .attr("d", path) //project data as geometry in svg
                .style("fill", function(d) { //color enumeration units
                        return choropleth(d, recolorPoly);
                })
                .on("mouseover", highlight)
                .on("mouseout", dehighlight)
                .on("mousemove", moveLabel)
                .on("click", changeDist)
                .append("desc") //append the current color
                    .text(function(d) {
                        return choropleth(d, recolorPoly);
                });
        

        setChart(csvData, recolorPoly); //create the bar chart
        createDropdown(csvData); //create the dropdown menu
        createLegend(); //create the legend
        setPopPyramid(popAges); //creates the population pyramid
        
    };//end callback
    
}// end setMap

function createDropdown(csvData) {
    //add a select element for the dropdown menu
    var dropdown = d3.select("body")
            .append("div")
            .attr("class", "dropdown") //for positioning menu with css
            .html("<h3>Select Variable:</h3>")
            .append("select")
            .on("change", function() {
                changeAttribute(this.value, csvData);
            });
    
    //create each option element within the dropdown
    dropdown.selectAll("options")
            .data(keyArray)
            .enter()
            .append("option")
            .attr("value", function(d) { return d })
            .text(function(d) { 
               return label(d);
            });
    
};// end create dropdown

function changeAttribute(attribute, csvData) {
    //change the expressed attribute
    expressed = attribute;
    //need to create a new recolor scheme because we changed expressed
    //there's a new scale for each attribute
    recolorPoly = colorScale(csvData);
    
    //recolor the map
    d3.selectAll(".districts")//selects every district
            .select("path")
            .style("fill", function(d) { //color enumeration units
                return choropleth(d, recolorPoly);
            })
            .select("desc") //replace the color text in each desc element
                .text(function(d) {
                        return choropleth(d, recolorPoly);
                });
    
    //re-sort the bar chart
    var bars = d3.selectAll(".bar")
        .sort(function(a, b){
            return a[expressed]-b[expressed];
        })
        .transition() //this adds the animation
        .delay(function(d,i){
            return i * 10
        });
    
    //update bars according to current attribute
    updateChart(bars, csvData);
    
}; //end changeAttribute

function setChart(csvData, recolorPoly) {
    //create a second svg element to hold the bar chart
    var chart = d3.select("body")
            .append("svg")
            .attr("width", chartWidth)
            .attr("height", chartHeight)
            .attr("class", "chart");
    
    //create a text element for the chart title
    var chartTitle = chart.append("text")
            .attr("x", 10)
            .attr("y", 30)
            .attr("class", "chartTitle");
    
    //set bars for each district
    var bars = chart.selectAll(".bar")
            .data(csvData)
            .enter()
            .append("rect")
            .sort(function(a, b) {return a[expressed]-b[expressed]})
            .attr("class", function(d) {
                return "bar " + d.TA2014;
            })
            .attr("width", chartWidth / csvData.length - 1)
            .on("mouseover", highlight)
            .on("mouseout", dehighlight)
            .on("mousemove", moveLabel)
            .on("click", changeDist);
    
    updateChart(bars, csvData);
    
};//end set chart

//updates the chart with heights and color
function updateChart(bars, csvData) {
    //style the bars accoring to currently expressed attribute
    var numbars = csvData.length;
    //find max value for expressed attribute
    var max = findMax();
    //find out how much space the title is taking up at the top - add another 10 pixels
    var titleY = (Number(d3.select(".chartTitle").attr("y")-10));
    
    bars.attr("height", function(d, i) { //sets height of the bars relative to total height usable under title
            return (((chartHeight-titleY)/max)*Number(d[expressed])); 
        })
        .attr("y", function(d, i) { //uses the height to put the bars at the bottom
            return chartHeight - (((chartHeight-titleY)/max)*Number(d[expressed]));
        })
        .attr("x", function(d,i) {
            return i * (chartWidth / numbars);
        })
        .style("fill", function(d) {
            return choropleth(d, recolorPoly);
        });
    
    //update chart title
    d3.select(".chartTitle")
            .text(label(expressed));
    
    //find the maximum value for the expressed atribute
    function findMax() {
        var tempMax = -Infinity;
        var newNum;
        for (var i = 0; i < csvData.length; i++) {
            newNum = Number(csvData[i][expressed])
            if (newNum > tempMax) {
                tempMax = newNum;
            }
        };
        return tempMax;
    };//end findMax
    
    updateLegend(d3.selectAll(".legendLabels"));
    
}; //end updateChart


function colorScale (csvData) {
    //create quantile classes with color scale
    var color = d3.scale.quantile() //sets up a quantile scale generator
            .range ([
                    "rgb(240,249,232)",
                    "rgb(186,228,188)",
                    "rgb(123, 204, 196)",
                    "rgb(67,162,202)",
                    "rgb(8, 104, 172)"
            ]);
    //build array of all currently expressed values for input domain
    var domainArray = [];
    for (var i in csvData) {
        domainArray.push(Number(csvData[i][expressed]));
    };
    
    //pass array of expressed values as domain
    color.domain(domainArray);
    
    //min and max values for domain for linear scaling
    /*color.domain([
        d3.min(csvData, function(d) {return Number(d[expressed]); }),
        d3.max(csvData, function(d) {return Number(d[expressed]); })
    ]);*/
    
    quantiles = color.quantiles();
    
    return color; //return the now set up color scale
    
}; //end colorScale

//creates a choropleth color scheme
function choropleth(d, recolorPoly) {
    //get data value
	var value = d.properties ? d.properties[expressed] : d[expressed];
    //if value exists, assign it a color; otherwise assign gray
    if (value) {
        return recolorPoly(value); //black box scale assignment
    } 
    else {
        return "#ccc";
    };
};// end choropleth

function highlight(data) {
    //json or csv properties
    var props = data.properties ? data.properties : data;
    
    d3.selectAll("."+props.TA2014) //select the current province
            .style("fill", "rgb(230, 100, 100)"); //set the enumeration unti fill to black
    var labelName = "<p class='labelname'>"+props.TA2014_NAM; //html string for name to go in child div
    var labelContents = labelName+" has</p><br><br><h1>"+props[expressed]+"</h1><br><b>"+label(expressed)+"</b>"; //label content

    
    //create info label div
    var infolabel = d3.select("body").append("div")
            .attr("class", "infolabel") //for styling label
            .attr("id", props.TA2014+"label") //for label div
            .html(labelContents) //add text
            //.append("div") //add child div for feature name
            //.attr("class", "labelname") //for styling name
            //.html(labelName); //add feature name to label
}; //end highlight

function dehighlight(data) {
    
    var props = data.properties ? data.properties : data;
    
    var dist = d3.selectAll("."+props.TA2014)//select the current district
    var fillcolor = dist.select("desc").text(); //reads original color
    dist.style("fill", fillcolor);
    
    d3.select("#"+props.TA2014+"label").remove();
    
}; //end dehighlight

function moveLabel() {

    if (d3.event.clientX < window.innerWidth - 230){
        var x = d3.event.clientX+10; //horizontal label coordinate based mouse position stored in d3.event
    }
    else {
        var x = d3.event.clientX-220; //horizontal label coordinate based mouse position stored in d3.event
    };
    if (d3.event.clientY < window.innerHeight - 160) {
        var y = d3.event.clientY-95; //vertical label coordinate
    }
    else {
        var y = d3.event.clientY-255; //vertical label coordinate
    };
    d3.select(".infolabel") //select the label div for moving
        .style("margin-left", x+"px") //reposition label horizontal
        .style("margin-top", y+"px");
};

//this funciton makes the attribute names meaningful
function label(attrName) {
    var labelText;
    switch(attrName) {
            case "PctNoTel":
                labelText = "% Without Telecommunications";
                break;
            case "PctSpkMao":
                labelText = "% Who Speak Maori";
                break;
            case "MaSpkOnMa":
                labelText = "% of Maori Who Only Speak Maori";
                break;
            case "PctMaRelig":
                labelText = "% Who Practice Maori Religion";
                break;
            case "MedIncMao":
                labelText = "Maori Median Income ($)";
                break;
            case "MedIncome":
                labelText = "Median Income ($)";
                break;
            case "PctMaori":
                labelText = "% Maori"
                break;
            case "Total_Pop":
                labelText = "Total Population"
                break;
    };
    return labelText;
}; //end label

//create the legend
function createLegend() {
    //array of 5 colors being used
    var colorArray = ["rgb(240,249,232)",
                    "rgb(186,228,188)",
                    "rgb(123, 204, 196)",
                    "rgb(67,162,202)",
                    "rgb(8, 104, 172)"]
    
    //selects the body and adds a box for the legend
    var legend = d3.select("body")
        .append("svg")
        .attr("width", 520)
        .attr("height", 70)
        .attr("class", "legend");
    
    //creates the legend boxes using the x coordinates and colors them
    //using the color array
    var legendBars = legend.selectAll(".legendBars")
        .data(xArray)
        .enter()
        .append("rect")
        .attr("class", "legendBars")
        .attr("y", 30)
        .attr("width", 60)
        .attr("height", 30)
        .attr("x", function (d, i) {
            return xArray[i];
        })
        .style("fill", function(d, i){
            return colorArray[i];
        });
    
    //creates labels for each legend box
    var legendLabels = legend.selectAll(".legendLabels")
        .data(xArray)
        .enter()
        .append("text")
        .attr("class", "legendLabels")
        .attr("y", 25);
    
    updateLegend(legendLabels);
};//end create legend

//updates the leged each time variable is changed
function updateLegend(legendLabels) {
    
    
    legendLabels.attr("x", function (d,i) {
                        return xArray[i] + 45
                })
                .text(function(d, i) {
                    if (i < 4) {
                        if (expressed == "Total_Pop") {
                            return Math.round(quantiles[i]);
                        }
                        if (expressed == "MedIncMao" || expressed == "MedIncome") {
                            return "$" + Math.round(quantiles[i]);
                        }
                        else {
                            return (Math.round(quantiles[i] * 100) /100) + "%";
                        }
                    };
                })
                .style("fill", "white");
    
}; //end update legend



function setPopPyramid(popAges) {
    
    var yRange = d3.scale.linear()
        .range([popHeight, 0]);
    
    var yAxis = d3.svg.axis()
        .scale(yRange)
        .orient("right")
        .tickSize(-popWidth)
        .tickFormat(d3.format(",.0f"));
    
    // An SVG element with a bott-right origin.
    var pyramid = d3.select("body").append("svg")
        .attr("width", popWidth)
        .attr("height", popHeight)
        .attr("class", "pyramid")
    
    //A label for the current year
    var pyramidTitle = pyramid.append("text")
        .attr("class", "pyramidTitle")
        .attr("dy", ".71em")
        .text("Total Maori Popluation");
    
    var pyramidSubtext = pyramid.append("text")
        .attr("class", "pyramidSubtext")
        .attr("dy", ".71em")
        .attr("y", 40)
        .text("Age Distribution");
    
        
    //convert strings to numbers
    popAges.forEach(function(d) {
        d.male = +d.male;
        d.female = +d.female;
    });
    
    //compute the extent of the data set in age and years
    var year1 = 2013;
    
    popRange = [];
    distVals = [];
    var found = false; // need to search for the correct district
    var i = 0;
    //searches for our staring values - no district selected so all (TA0)
    while (!found) {
        if (popAges[i].TA2014 == "TA0") {
            for (var j = 0; j<18; j++) {
                var district = popAges[i+j];
                popRange.push(district.male);
                popRange.push(district.female);
                distVals.push(district);
            };
            found = true;
        };
        i++;
    };
    
    popRange.reverse();
    distVals.reverse();
    
    //set bars for selected district
    var malePopBars = pyramid.selectAll(".malePopBars")
            .data(distVals)
            .enter()
            .append("rect")
            .attr("class", function(d) {
                return "malePopVal " + d.age;
            })
            .attr("width", popBarWidth)
            .on("mouseover", showPop)
            .on("mousemove", moveLabel)
            .on("mouseout", hidePop);
    
    var femalePopBars = pyramid.selectAll(".femalePopBars")
        .data(distVals)
        .enter()
        .append("rect")
        .attr("class", function(d) {
            return "femalePopVal " + d.age;
        })
        .attr("width", popBarWidth)
        .on("mouseover", showPop)
        .on("mousemove", moveLabel)
        .on("mouseout", hidePop);
    
    var age = pyramid.selectAll(".age")
        .data(distVals)
        .enter()
        .append("text")
        .attr("class", "age")
        .attr("x", function(d, i) { return (.15*popBarWidth)+(i*(popWidth/18))})
        .attr("y", popHeight-1)
        .text(function(d) {return d.age})
        .attr("fill", "white");
    
    
    updatePyramid(popAges);
    
}; //end setPopPyramid
    
function updatePyramid(popAges) {
   
    var pyramid = d3.select(".pyramid");
    
    var maxPop = d3.max(popRange);
    
    var malePopBars = d3.selectAll(".malePopVal")
        .data(distVals);
    
    var femalePopBars = d3.selectAll(".femalePopVal")
        .data(distVals);
        
    
    malePopBars.attr("height", function(d, i) { //sets height of the bars relative to total height usable under title
            return ((popHeight/maxPop)*Number(d.male)); 
        })
        .attr("y", function(d, i) { //uses the height to put the bars at the bottom
            return popHeight - ((popHeight/maxPop)*Number(d.male));
        })
        .attr("x", function(d,i) {
            return i * (popWidth / 18);
        })
        .style("fill", function(d) {
            return "rgb(8, 104, 172)";
        })
        .style("opacity", 0.5);
     
    femalePopBars = d3.selectAll(".femalePopVal")
        .attr("height", function(d, i) { //sets height of the bars relative to total height usable under title
            return ((popHeight/maxPop)*Number(d.female)); 
        })
        .attr("y", function(d, i) { //uses the height to put the bars at the bottom
            return popHeight - ((popHeight/maxPop)*Number(d.female));
        })
        .attr("x", function(d,i) {
            return i * (popWidth / 18);
        })
        .style("fill", function(d) {
            return "rgb(230, 100, 100)";
        })
        .style("opacity", 0.5);

    
    
}; //end update pyramids

function changeDist(data) {
    
    var props = data.properties ? data.properties : data;
    
    var distID;
    var titleText;
    
    if (props.TA2014 == undefined) {
        distID = "TA0";
        titleText = "Total Maori Population"
    }
    else {
        distID = props.TA2014
        titleText = props.TA2014_NAM
    };
    
    var pyramidTitle = d3.select(".pyramidTitle")
        .text(titleText);

    popRange = [];
    distVals = [];
    var found = false; // need to search for the correct district
    var i = 0;
    //searches for our staring values - no district selected so all (TA0)
    while (!found) {
        if (popAges[i].TA2014 == distID) {
            for (var j = 0; j<18; j++) {
                var district = popAges[i+j];
                popRange.push(district.male);
                popRange.push(district.female);
                distVals.push(district);
            };
            found = true;
        };
        i++;
    };
    
    popRange.reverse();
    distVals.reverse();
    
    updatePyramid(popAges);
}// end change District

function showPop(data) {
    var popMale = data.male;
    var popFemale = data.female;
    
    var labelName = "<p class='labelname'>"+data.TA2014_NAM; //html string for name to go in child div
    var labelContents;
    if (data.TA2014_NAM == "New Zealand") {
        labelContents = labelName+" has</p><br><h2>"+popMale+" male & <h2>"+popFemale+" female Maori</h2> " +data.age+ " years old"; //label content
    }
    else {
        labelContents = labelName+" has</p><br><br><h2>"+popMale+" male & <h2>"+popFemale+" female Maori</h2> " +data.age+ " years old"; //label content
    }
    //create info label div
    var infolabel = d3.select("body").append("div")
            .attr("class", "infolabel") //for styling label
            .attr("id", data.TA2014+"label") //for label div
            .style("height", function () {
                    if (data.TA2014_NAM == "New Zealand") {
                        return 120;
                    }})
            .html(labelContents);
    

    
}

function hidePop(data) {
    d3.select("#"+data.TA2014+"label").remove();
}
