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
        headers={{
          Authorization:
            `ApiKey ${process.env.REACT_APP_ELASTIC_API_KEY}`,
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
        />
        <ReactiveList
          componentId="searchresults"
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
