export function createReplay({onChange=()=>{},delay=1400,schedule=setTimeout,cancel=clearTimeout}={}) {
  let events=[],cursor=-1,running=false,speed=1,timer=null,disposed=false;
  const snapshot=reason=>({events:structuredClone(events),cursor,running,speed,reason});
  const emit=reason=>{if(!disposed)onChange(snapshot(reason));};
  const clear=()=>{if(timer!==null)cancel(timer);timer=null;};
  function pause(){clear();running=false;emit('pause');}
  function advance(reason){if(cursor<events.length-1){cursor++;if(cursor===events.length-1){clear();running=false;}emit(reason);}}
  function tick(){clear();if(!running||disposed)return;advance('play');if(running)timer=schedule(tick,delay/speed);}
  return {
    load(value){if(disposed)return;if(!Array.isArray(value)||value.length>500)throw Error('A replay needs at most 500 events.');clear();running=false;events=structuredClone(value);cursor=-1;emit('load');},
    next(){if(disposed)return;clear();running=false;advance('step');},
    previous(){if(disposed)return;clear();running=false;cursor=Math.max(-1,cursor-1);emit('inspect');},
    seek(index){if(disposed)return;if(!Number.isInteger(index)||index<0||index>=events.length)throw Error('Invalid replay position.');clear();running=false;cursor=index;emit('inspect');},
    play(){if(disposed||!events.length||running)return;if(cursor===events.length-1)cursor=-1;running=true;advance('play');if(running)timer=schedule(tick,delay/speed);},
    pause,
    setSpeed(value){if(![0.5,1,2,4].includes(value))throw Error('Unsupported replay speed.');speed=value;clear();emit('speed');if(running)timer=schedule(tick,delay/speed);},
    snapshot:()=>snapshot('snapshot'),
    destroy(){clear();running=false;disposed=true;}
  };
}

export function mountReplay(host,{build,onFrame=()=>{},onError=()=>{},playSelector='[data-play]',nextSelector='[data-next]',resetSelector='[data-reset]',statusSelector='.module-result',playLabel='Play',pauseLabel='Pause',separator='of'}){
  const play=host.querySelector(playSelector),next=host.querySelector(nextSelector),reset=host.querySelector(resetSelector),status=host.querySelector(statusSelector);
  if(!play||!next||!reset||!status)throw Error('Missing replay controls.');
  const previous=document.createElement('button');previous.type='button';previous.textContent='Previous step';previous.dataset.replayPrevious='';
  next.before(previous);
  const speedLabel=document.createElement('label');speedLabel.className='field';speedLabel.textContent='Playback speed';
  const speed=document.createElement('select');speed.setAttribute('aria-label','Playback speed');
  [0.5,1,2,4].forEach(value=>{const option=document.createElement('option');option.value=String(value);option.textContent=value+'×';speed.append(option);});speed.value='1';speedLabel.append(speed);play.parentElement.append(speedLabel);
  const details=document.createElement('details');details.className='replay-events';const summary=document.createElement('summary');summary.textContent='Event timeline and inspection';const timeline=document.createElement('ol');timeline.className='replay-timeline';details.append(summary,timeline);status.after(details);
  host.dataset.sharedReplay='true';
  let replay;
  replay=createReplay({onChange:s=>{
    play.textContent=s.running?pauseLabel:playLabel;play.disabled=!s.events.length;next.disabled=s.cursor===s.events.length-1||!s.events.length;previous.disabled=s.cursor<0;
    speed.value=String(s.speed);
    const event=s.events[s.cursor];const message=typeof event==='string'?event:event?.message;
    status.textContent=s.cursor<0?'Ready.':'Step '+(s.cursor+1)+' '+separator+' '+s.events.length+': '+message;
    if(s.reason==='load')timeline.replaceChildren(...s.events.map((event,i)=>{
      const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.textContent=typeof event==='string'?event:event.message;
      if(i===s.cursor)button.setAttribute('aria-current','step');button.onclick=()=>replay.seek(i);li.append(button);return li;
    }));
    [...timeline.querySelectorAll('button')].forEach((button,i)=>{if(i===s.cursor)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
    onFrame(s.cursor,s.events,s);
  }});
  function rebuild(){try{const events=build();replay.load(events);}catch(error){replay.load([]);status.textContent=error.message;onError(error);}}
  play.onclick=()=>replay.snapshot().running?replay.pause():replay.play();next.onclick=()=>replay.next();previous.onclick=()=>replay.previous();reset.onclick=rebuild;speed.onchange=()=>replay.setSpeed(Number(speed.value));
  rebuild();
  return {reset:rebuild,pause:()=>replay.pause(),destroy:()=>replay.destroy(),snapshot:()=>replay.snapshot()};
}
