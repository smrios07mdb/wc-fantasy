// matchdetail/mobile.jsx — mobile Match Detail inside the iOS frame.
function MobileMatch({ t, tab, setTab, statMode, half, setHalf, onOpen, conn }){
  return (
    <IOSDevice dark width={402} height={874}>
      <div className="mmd">
        <div className="mmd-top">
          <button className="md-back">‹ Back</button>
          <ConnPill state={conn}/>
        </div>
        <Scoreboard t={t} conn={conn}/>
        <MyStakeStrip t={t} onOpen={onOpen}/>
        <TabBar tab={tab} setTab={setTab} mob/>
        <div className="mmd-tabwrap">
          <TabContent tab={tab} t={t} statMode={statMode} half={half} setHalf={setHalf} onOpen={onOpen} mob/>
        </div>
      </div>
    </IOSDevice>
  );
}
Object.assign(window, { MobileMatch });
