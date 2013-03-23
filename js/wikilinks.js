var svg,
	w = 960,
	h = document.height -20,
	node,
	link,
	nodes,
	links,
	force,
	fetched_pages,
	browsed_pages,
	queued_pages,
	name1,
	name2,
	current_recursivity_level,
	max_recursion_level,
	link_found=false,
	node_titles;
	
var MAX_PAGES_NUMBER_PER_REQUEST=50;
var REMOTE_API = JsMwApi("http://en.wikipedia.org/w/api.php");

d3.select('#OK').on('click',function() {
	nodes=[];
	links=[];
	browsed_pages={};
	fetched_pages={};
	node_titles=[];
	queued_pages=[];
	current_recursivity_level=0;
	d3.select('#chart svg').remove();
	d3.select('#log').text("");
	d3.select('#articles_found_counter').text(0);
	d3.select('#articles_browsed_counter').text(0);
	d3.select('#api_call_counter').text(0);
	
	name1=d3.select('#page1')[0][0].value,
	name2=d3.select('#page2')[0][0].value,
	max_recursion_level=parseInt(d3.select('#max_recursion_level')[0][0].value);
	if (max_recursion_level > 2) {
		alert("Sorry, for the moment the recursion level can't be set to higher than 2. "
			+ "Of course you can easily hack the code but don't complain afterwards !");
		return;
	}
	add_node(0,name1,0);
	add_node(1,name2,0);
	fetch(nodes.slice(0),false,false);
});

d3.select('#log_toggle').on('click',function() {
	d3.select('#log').classed('hidden',! d3.select('#log').classed('hidden'));
});


function fetch(nodes_to_fetch,plcontinue) {
	var titles=[];
	for (var i in nodes_to_fetch) {
		titles.push(nodes_to_fetch[i].name);
	}
	var parameters={action: "query", prop: "links", titles: titles, pllimit: 500, plnamespace: 0};
	if (plcontinue) {
		parameters["continue"]="||";
		parameters["plcontinue"]=plcontinue;
	}
	else {
		parameters["continue"]="";
	}
	REMOTE_API(parameters, function (res){ 
		d3.select('#api_call_counter').text(parseInt(d3.select('#api_call_counter').text())+1);
		for(var page in res.query.pages) {
			if (!fetched_pages[page] || !fetched_pages[page].links) {
				fetched_pages[page]=res.query.pages[page];
			}
		}
		d3.select('#articles_found_counter')
			.text(parseInt(d3.select('#articles_found_counter').text())+Object.size(res.query.pages));
		
		if (res["continue"]) {
			fetch(nodes_to_fetch,res["continue"]["plcontinue"]);
		}
		else {
			var next_pages_to_fetch=get_next_pages_to_fetch();
			if (Object.size(next_pages_to_fetch) > 0) {
				fetch(next_pages_to_fetch,false);
			}
			else {
                analyze(res);
				fetch_for_next_recursivity_level();
			}
		}
	});
}

function analyze(res) {
	if (res.query == undefined) {
		return;
	}
	var source_id=null;
	for(var page in fetched_pages) {
		var current_page=fetched_pages[page];
		d3.select('#log').append('p').classed('source_page',true).text('From '+current_page.title+' : ');
		source_id=node_titles.indexOf(current_page.title);
		if (current_page.links != undefined) {
			nodes[source_id].size+=Object.size(current_page.links);
			for (var link in current_page.links) {
				var new_node=current_page.links[link];
				var clean_node_title = getCleanNodeTitle(new_node.title);
				if (browsed_pages[new_node.title] == undefined) {
					var new_node_id=Object.size(nodes);
					add_node(new_node_id,new_node.title,nodes[source_id].recursion_level+1);
					add_link(source_id,new_node_id);
					d3.select('#log').append('p').attr('name',clean_node_title).text(new_node.title);
				}
				else {
					add_link(source_id,browsed_pages[new_node.title]);
					nodes.filter(function(d) { 
						return d.name == new_node.title; })[0]
						.crossfound=true;
					d3.select('[name="'+clean_node_title+'"]')
						.classed('preexists',true)
						.text(new_node.title+'<==>'+node_titles[source_id]);
				}
			}
		}
	}
	d3.select('#articles_browsed_counter')
		.text(parseInt(d3.select('#articles_browsed_counter').text())+Object.size(fetched_pages));
}

function add_node(id,title,recursion_level) {
	nodes[id]=({'id':id, 'name':title,'recursion_level':recursion_level,'size':1});
	node_titles[id]=title;
	queued_pages.push(nodes[id]);
	browsed_pages[title]=id;
}

function add_link(source_id,target_id) {
	links.push({'source':nodes[source_id],'target':nodes[target_id]});
}

var last_page_to_fetch;

function fetch_for_next_recursivity_level() {
	current_recursivity_level++;
	if (current_recursivity_level < max_recursion_level) {
		last_page_to_fetch=0;
		var pages_to_fetch = get_next_pages_to_fetch();
		fetch(pages_to_fetch,false);
	}
	else {
		render();
	}
}

function get_next_pages_to_fetch() {
	var pages_to_fetch=[];
	var cpt=0;
	for (var i in queued_pages) {
		if (cpt >= last_page_to_fetch) {
			if (cpt >= MAX_PAGES_NUMBER_PER_REQUEST) {
				break;
			}
			pages_to_fetch.push(queued_pages[i]);
		}
		cpt++;
	}
	last_page_to_fetch = cpt;
	return pages_to_fetch;
}

function render() {
	clean_nodes();
	force = d3.layout.force()
		.on("tick", tick)
		.size([w, h])
		.gravity(0.2)
		.charge(-150);

	svg = d3.select("#chart").append("svg:svg")
		.attr("width", w)
		.attr("height", h)
		.call(d3.behavior.zoom()
			.on("zoom",function() {
				svg.selectAll("svg>line,svg>circle").attr("transform", "translate(" +  d3.event.translate[0] + "," + d3.event.translate[1] + ") scale(" +  d3.event.scale + ")"); 	
			}));


	update();
}

function clean_nodes() { // Removes nodes with only 1 link
	var isolated_nodes=[];
	var sides=['source','target'];
	var nodes_copy=nodes.slice(0);
	var links_copy=links.slice(0);var nb_removed;
	
	/*for (var i in links) {
		for (var j in sides) {
			isolated_nodes[links[i][sides[j]].id] = isolated_nodes[links[i][sides[j]].id] === undefined ? true : false;
		}
	}
	
	nb_removed=0;
	for (var i in nodes) {
		if (isolated_nodes[nodes[i].id] === true) {
			d3.select('[name="'+getCleanNodeTitle(nodes[i].name)+'"]').classed('strike',true);
			nodes_copy.splice(i-nb_removed++,1);
		}
	}
	
	nb_removed=0;
	for (var i in links) {
		for (var j in sides) {
			if (isolated_nodes[links[i][sides[j]].id] === true) {
				links_copy.splice(i-nb_removed++,1);
				break;
			}
		}
	}*/
	nodes=nodes_copy;
	links=links_copy;
}

function get_normalized_title(title, list) {
	for (var i in list) {
		if (list[i].to === title)
			return list[i].from;
	}
	return undefined;
}

function update() {
  // Restart the force layout.
  force
	  .nodes(nodes)
	  .links(links)
	  .linkDistance(60)
	  .friction(0.6)
	  .start();

  // Update the links
  link = svg.selectAll("line.link")
	  .data(links, function(d) { return d.target.id; });

  // Enter any new links.
  link.enter().append("svg:line")
  .attr("class", "link");
	  /*.attr("x1", function(d) { return d.source.x; })
	  .attr("y1", function(d) { return d.source.y; })
	  .attr("x2", function(d) { return d.target.x; })
	  .attr("y2", function(d) { return d.target.y; });*/

  // Exit any old links.
  //link.exit().remove();

  // Update the nodes
  node = svg.selectAll("circle.node")
	  .data(nodes, function(d) { return d.id; })
	  .style("fill", color);

  // Enter any new nodes.
  node.enter().append("svg:circle")
	  .attr("class", "node")
	  //.attr("cx", function(d) { return d.x; })
	  //.attr("cy", function(d) { return d.y; })
	  .attr("r", function(d) { return 5; })
	  .style("fill", color).append("title")
	  .text(function(d) { return d.name; })
	  .call(force.drag);

  // Exit any old nodes.
  node.exit().remove();
}

function tick() {
  link.attr("x1", function(d) { return d.source.x; })
	  .attr("y1", function(d) { return d.source.y; })
	  .attr("x2", function(d) { return d.target.x; })
	  .attr("y2", function(d) { return d.target.y; });

  node.attr("cx", function(d) { return d.x; })
	  .attr("cy", function(d) { return d.y; });
}

function color(d) {
	if (d.crossfound) {
		return "#ff0000";
	}
  var level_on_15=parseInt(15*(d.recursion_level / (max_recursion_level+1)));
  var digit=level_on_15<10 ? level_on_15 : String.fromCharCode("a".charCodeAt(0)+(level_on_15-10));
  return "#"+digit+""+digit+""+digit;
}

// Toggle children on click.
function click(d) {
  if (d.children) {
	d._children = d.children;
	d.children = null;
  } else {
	d.children = d._children;
	d._children = null;
  }
			alert(force.alpha);
  update();
}

/* Util functions */
function getCleanNodeTitle(title) {
	return title
			.replace(/ /g,'_')
			.replace(/"/g,'');
}

Object.size = function(obj) {
    var size = 0, key = null;
    for (key in obj) {
        if (obj.hasOwnProperty(key)) size++;
    }
    return size;
};