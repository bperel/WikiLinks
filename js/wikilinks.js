var w = 960,
	h = 500,
	node,
	link,
	nodes,
	links,
	force,
	vis,
	fetched_pages,
	browsed_pages,
	queued_pages,
	name1,
	name2,
	max_recursion_level,
	link_found=false,
	node_titles;
	
var MAX_PAGES_NUMBER_PER_REQUEST=50;
var REMOTE_API = JsMwApi("http://en.wikipedia.org/w/api.php");

d3.select('#OK').on('click',function() {
	nodes=[];
	links=[];
	browsed_pages=[];
	fetched_pages=[];
	node_titles=[];
	d3.select('#chart svg').remove();
	d3.select('#log').text("");
	d3.select('#node_counter').text(0);
	d3.select('#api_call_counter').text(0);
	
	name1=d3.select('#page1')[0][0].value,
	name2=d3.select('#page2')[0][0].value,
	max_recursion_level=parseInt(d3.select('#max_recursion_level')[0][0].value)-1;
		
	add_node(name1,0);
	add_node(name2,0);
	fetch(nodes.slice(0),false,function() {
		clean_nodes();
		force = d3.layout.force()
			.on("tick", tick)
			.size([w, h])
			.gravity(0.2)
			.charge(-150);

		vis = d3.select("#chart").append("svg:svg")
			.attr("width", w)
			.attr("height", h);

		update();
	});
});

d3.select('#log_toggle').on('click',function() {
	d3.select('#log').classed('hidden',! d3.select('#log').classed('hidden'));
});


function fetch(nodes_to_fetch,just_store,callback) {
	var titles=[];
	for (var i in nodes_to_fetch) {
		titles.push(nodes_to_fetch[i].name);
	}
	REMOTE_API({action: "query", prop: "links", titles: titles, pllimit: 500, plnamespace: 0}, function (res){ 
		d3.select('#api_call_counter').text(parseInt(d3.select('#api_call_counter').text())+1);
		for(var page in res.query.pages) {
			fetched_pages[page]=res.query.pages[page];
		}
		if (!just_store) {
			if (res.query == undefined) {
				nodes=[];
				callback();
				return;
			}
			/*var notFound=[];
			for(var pageId in res.query.pages) {
				if (pageId == -1) {
					notFound.push(res.query.pages[pageId].title);
				}
			}
			if (notFound.length > 0) {
				alert(notFound.join(", ")+" do(es) not exist, aborting !");
				nodes=[];
				callback();
				return;
			}*/
			
			var source_id= null;
			for(var page in fetched_pages) {
				var current_page=fetched_pages[page];
				d3.select('#log').append('p').classed('source_page',true).text('From '+current_page.title+' : ');
				var source_pageid=current_page.pageid;
				source_id=node_titles.indexOf(current_page.title);
				if (current_page.links != undefined) {
					nodes[source_id].size+=current_page.links.length;
					for (var link in current_page.links) {
						var new_node=current_page.links[link];
						var clean_node_title = getCleanNodeTitle(new_node.title);
						if (browsed_pages[new_node.title] == undefined || browsed_pages[new_node.title] > nodes.length /* JS bug fix */) {
							var new_node_id=nodes.length;
							add_node(new_node.title,nodes[source_id].recursion_level+1);
							add_link(source_id,new_node_id);
							d3.select('#log').append('p').attr('name',clean_node_title).text(new_node.title);
						}
						else {
							add_link(source_id,browsed_pages[new_node.title]);
							d3.select('[name="'+clean_node_title+'"]')
								.classed('preexists',true)
								.text(new_node.title+'<==>'+node_titles[source_id]);
							/*callback();
							return;*/
						}
					}
				}
				browsed_pages[current_page.title]=source_pageid;
			}
			if (nodes[source_id].recursion_level < max_recursion_level) {
				var i=0;
				while (i<nodes.length) {
					queued_pages=[];
					for(i;i<nodes.length && queued_pages.length < MAX_PAGES_NUMBER_PER_REQUEST;i++) {
						if (nodes[i].recursion_level == nodes[source_id].recursion_level+1)
							queued_pages.push(nodes[i]);
					}
					fetch(queued_pages,i<nodes.length,callback);
				}
			}
			else
				callback();
		}
	});
}

function add_node(title,recursion_level) {
	var id=nodes.length;
	nodes.push({'id':id,'name':title,'recursion_level':recursion_level,'size':1});
	node_titles[id]=title;
	browsed_pages[title]=id;
	d3.select('#node_counter').text(parseInt(d3.select('#node_counter').text())+1);
}

function add_link(source_id,target_id) {
	links.push({'source':nodes[source_id],'target':nodes[target_id]});
}

function clean_nodes() { // Removes nodes with only 1 link
	var isolated_nodes=[];
	var sides=['source','target'];
	var nodes_copy=nodes.slice(0);
	var links_copy=links.slice(0);var nb_removed;
	
	for (var i in links) {
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
	}
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
  link = vis.selectAll("line.link")
	  .data(links, function(d) { return d.target.id; });

  // Enter any new links.
  link.enter().insert("svg:line", ".node")
	  .attr("class", "link")
	  .attr("x1", function(d) { return d.source.x; })
	  .attr("y1", function(d) { return d.source.y; })
	  .attr("x2", function(d) { return d.target.x; })
	  .attr("y2", function(d) { return d.target.y; });

  // Exit any old links.
  link.exit().remove();

  // Update the nodes
  node = vis.selectAll("circle.node")
	  .data(nodes, function(d) { return d.id; })
	  .style("fill", color);

  // Enter any new nodes.
  node.enter().append("svg:circle")
	  .attr("class", "node")
	  .attr("cx", function(d) { return d.x; })
	  .attr("cy", function(d) { return d.y; })
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