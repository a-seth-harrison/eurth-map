// Credit line in the bottom-right corner, in both views: the map and nation data are the
// Eurth community's, the tool is the owner's. The whole line links to the data license.
const DATA_LICENSE_URL = "https://github.com/a-seth-harrison/eurth-map/blob/main/LICENSE-DATA.md";

export default function Credits() {
  return (
    <a className="credits" href={DATA_LICENSE_URL} target="_blank" rel="noopener noreferrer">
      Map and nation data: the Eurth community · Map tool: Seth Harrison
    </a>
  );
}
