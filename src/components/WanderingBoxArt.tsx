// Layered original artwork: the door faces remain attached to their hinges,
// revealing a small illuminated room only while their centre edges part.
export function WanderingBoxArt({ id }: { id: string }) {
  const src = "/bookmarks/wandering-blue-box.png";
  return <>
    <defs>
      <clipPath id={`${id}-doorway`}><rect x="405" y="199" width="214" height="295"/></clipPath>
      <clipPath id={`${id}-left-door`}><rect x="405" y="199" width="107" height="295"/></clipPath>
      <clipPath id={`${id}-right-door`}><rect x="512" y="199" width="107" height="295"/></clipPath>
      <radialGradient id={`${id}-room`}><stop stopColor="#e9c87d"/><stop offset=".4" stopColor="#34595d"/><stop offset="1" stopColor="#091a29"/></radialGradient>
      <radialGradient id={`${id}-lamp`}><stop stopColor="#fffce7" stopOpacity=".9"/><stop offset=".3" stopColor="#bfefff" stopOpacity=".55"/><stop offset="1" stopColor="#73bfff" stopOpacity="0"/></radialGradient>
    </defs>
    <g className="time-blue-box-presence">
      <animate attributeName="opacity" values="1;1;.65;.2;.7;1;1" keyTimes="0;.65;.72;.78;.84;.9;1" dur="24s" repeatCount="indefinite"/>
      <g transform="translate(512 750)"><g className="time-blue-box-scale">
        <animateTransform attributeName="transform" type="scale" values="1;1;.99;1;1" keyTimes="0;.65;.78;.9;1" dur="24s" repeatCount="indefinite"/>
        <g transform="translate(-512 -750)">
          <image href={src} width="1024" height="1536"/>
          <g clipPath={`url(#${id}-doorway)`}>
            <rect x="405" y="199" width="214" height="295" fill={`url(#${id}-room)`}/>
            <image href="/bookmarks/wandering-blue-box-interior.png" x="405" y="199" width="214" height="295" preserveAspectRatio="xMidYMid slice"/>
            <g transform="translate(405 0)"><g className="time-blue-box-left">
              <animateTransform attributeName="transform" type="scale" values="1 1;1 1;.76 1;.76 1;1 1;1 1" keyTimes="0;.18;.26;.36;.44;1" dur="24s" repeatCount="indefinite" calcMode="spline" keySplines=".42 0 .58 1;.42 0 .58 1;.42 0 .58 1;.42 0 .58 1;.42 0 .58 1"/>
              <g transform="translate(-405 0)" clipPath={`url(#${id}-left-door)`}><image href={src} width="1024" height="1536"/></g>
            </g></g>
            <g transform="translate(619 0)"><g className="time-blue-box-right">
              <animateTransform attributeName="transform" type="scale" values="1 1;1 1;.76 1;.76 1;1 1;1 1" keyTimes="0;.18;.26;.36;.44;1" dur="24s" repeatCount="indefinite" calcMode="spline" keySplines=".42 0 .58 1;.42 0 .58 1;.42 0 .58 1;.42 0 .58 1;.42 0 .58 1"/>
              <g transform="translate(-619 0)" clipPath={`url(#${id}-right-door)`}><image href={src} width="1024" height="1536"/></g>
            </g></g>
          </g>
          <ellipse className="time-blue-box-lantern" cx="512" cy="64" rx="50" ry="46" fill={`url(#${id}-lamp)`}>
            <animate attributeName="opacity" values=".08;.7;.1;.55;.08;.08;.6;.08" keyTimes="0;.09;.16;.23;.3;.65;.78;1" dur="24s" repeatCount="indefinite"/>
          </ellipse>
        </g>
      </g></g>
    </g>
  </>;
}
