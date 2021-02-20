import React, { Component } from "react";
import {
  ReactiveBase,
  DataSearch,
  ReactiveList,
} from "@appbaseio/reactivesearch";

class App extends Component {
  render() {
    return (
      <ReactiveBase
        app="qa"
        index="qa"
        url="http://localhost:3000"
        transformRequest={props => {
          console.log(props);
          // body is msearch (one header line + 1 line per search query), we use only the 1st query and parse it as json
          const body = JSON.parse(props.body.substring(props.body.indexOf("\n") + 1).trim());
          console.log(body);

          props.body = JSON.stringify({
            from: body.from || 0,
            size: body.size || 10,
            term: body.term || ''
          });

          props.headers['Content-Type'] = 'application/json';
          
          props.url = props.url.replace('qa/_msearch', 'search')

          return props;
        }}
        theme={{
          typography: {
            fontFamily: "initial",
            fontSize: "initial",
          },

          colors: {
            textColor: "#FFFFFF",
            primaryTextColor: "#FFFFFF",
            primaryColor: "#FFFFFF",
            titleColor: "#FFFFFF",
            alertColor: "#FFFFFF",
          },
        }}
      >
        <DataSearch
          componentId="searchbox"
          dataField="content_html"
          placeholder=""
          autosuggest={false}
          highlight={true}
          customHighlight={(props) => ({
            highlight: {
              pre_tags: ["<mark>"],
              post_tags: ["</mark>"],
              fields: {
                content_html: {},
              },
              number_of_fragments: 0,
            },
          })}
          customQuery={(term) => ({
            term
          })}
        />
        <ReactiveList
          componentId="searchresults"
          dataField="content_html"
          react={{
            and: ["searchbox"],
          }}
          renderItem={(res) => (
            <div
              dangerouslySetInnerHTML={{
                __html: "</br></br>" + res.content_html,
              }}
            />
          )}
          renderResultStats={(stats) => (
            <p style={{ fontSize: "0.83em" }}>{`${
              stats.numberOfResults < 10000
                ? stats.numberOfResults
                : "More than 10000"
            } results founds in ${stats.time} ms.`}</p>
          )}
          renderNoResults={() => (
            <p style={{ fontSize: "0.83em" }}>No results found.</p>
          )}
        />
      </ReactiveBase>
    );
  }
}

export default App;
