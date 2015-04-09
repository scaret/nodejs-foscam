/*
Name:     nodejs-foscam
Source:   https://github.com/fvdm/nodejs-foscam
Feedback: https://github.com/fvdm/nodejs-foscam/issues

This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any
means.

In jurisdictions that recognize copyright laws, the author or authors
of this software dedicate any and all copyright interest in the
software to the public domain. We make this dedication for the benefit
of the public at large and to the detriment of our heirs and
successors. We intend this dedication to be an overt act of
relinquishment in perpetuity of all present and future rights to this
software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <http://unlicense.org/>
*/

var http = require('http')
var querystring = require('querystring')
var fs = require('fs')
var EventEmitter = require('events').EventEmitter
var parseString = require('xml2js').parseString;

var app = new EventEmitter

// defaults
app.settings = {
  host: '192.168.1.239',
  port: 81,
  user: 'admin',
  pass: ''
}

// overrides
app.setup = function( props, cb ) {
  for( var key in props ) {
    app.settings[ key ] = props[ key ]
  }

  if( typeof cb == 'function' ) {
    app.status( cb )
  }
}


// status
app.status = function( cb ) {
  app.talk({
    path: 'cgi-bin/CGIProxy.fcgi',
    fields: {
      cmd : 'getDevState',
    },
    callback: function( err, data ) {
      if (err)
      {
        console.log(err);
        return cb(err);
      }
      var result = {};
      for (var key in data.CGI_Result)
      {
        if (data.CGI_Result[key] instanceof Array && data.CGI_Result[key].length == 1)
        {
           result[key] = data.CGI_Result[key][0];
        }
        else
        {
          result[key] = data.CGI_Result[key]
        }
      }

      if( result.alarm_status ) {
        switch( result.IOAlarm ) {
          case '0': result.IOAlarm_str = 'no alarm'; break
          case '1': result.IOAlarm_str = 'motion alarm'; break
          case '2': result.IOAlarm_str = 'input alarm'; break
        }
      }

      if( result.ddnsState ) {
        switch( result.ddnsState ) {
          case '0': result.ddnsState_str = 'No Action'; break
          case '1': result.ddnsState_str = 'It\'s connecting...'; break
          case '2': result.ddnsState_str = 'Can\'t connect to the Server'; break
          case '3': result.ddnsState_str = 'Dyndns Succeed'; break
          case '4': result.ddnsState_str = 'DynDns Failed: Dyndns.org Server Error'; break
          case '5': result.ddnsState_str = 'DynDns Failed: Incorrect User or Password'; break
          case '6': result.ddnsState_str = 'DynDns Failed: Need Credited User'; break
          case '7': result.ddnsState_str = 'DynDns Failed: Illegal Host Format'; break
          case '8': result.ddnsState_str = 'DynDns Failed: The Host Does not Exist'; break
          case '9': result.ddnsState_str = 'DynDns Failed: The Host Does not Belong to You'; break
          case '10': result.ddnsState_str = 'DynDns Failed: Too Many or Too Few Hosts'; break
          case '11': result.ddnsState_str = 'DynDns Failed: The Host is Blocked for Abusing'; break
          case '12': result.ddnsState_str = 'DynDns Failed: Bad Reply from Server'; break
          case '13': result.ddnsState_str = 'DynDns Failed: Bad Reply from Server'; break
          case '14': result.ddnsState_str = 'Oray Failed: Bad Reply from Server'; break
          case '15': result.ddnsState_str = 'Oray Failed: Incorrect User or Password'; break
          case '16': result.ddnsState_str = 'Oray Failed: Incorrect Hostname'; break
          case '17': result.ddnsState_str = 'Oray Succeed'; break
          case '18': result.ddnsState_str = 'Reserved'; break
          case '19': result.ddnsState_str = 'Reserved'; break
          case '20': result.ddnsState_str = 'Reserved'; break
          case '21': result.ddnsState_str = 'Reserved'; break
        }
      }

      if( result.upnpState ) {
        switch( result.upnpState ) {
          case '0': result.upnpState_str = 'No Action'; break
          case '1': result.upnpState_str = 'Succeed'; break
          case '2': result.upnpState_str = 'Device System Error'; break
          case '3': result.upnpState_str = 'Errors in Network Communication'; break
          case '4': result.upnpState_str = 'Errors in Chat with UPnP Device'; break
          case '5': result.upnpState_str = 'Rejected by UPnP Device, Maybe Port Conflict'; break
        }
      }

      cb( result )
    }
  })
}


// camera params
app.camera_params = function( cb ) {
  app.talk({
    path: 'get_camera_params.cgi',
    callback: function( data ) {
      var result = {}
      data.replace( /var ([^=]+)=([^;]+);/g, function( str, key, value ) {
        result[ key ] = parseInt( value )
      })
      cb( result )
    }
  })
}


// Presets
app.preset = {
  id2cmd: function( action, id ) {
    var cmds = {
      set: [30,32,34,36,38,40,42,44,46,48,50,52,54,56,58,60],
      go: [31,33,35,37,39,41,43,45,47,49,51,53,55,57,59,61]
    }
    return cmds[ action ][ id-1 ]
  },

  set: function( id, cb ) {
    app.control.decoder( app.preset.id2cmd( 'set', id ), cb )
  },

  go: function( id, cb ) {
    app.control.decoder( app.preset.id2cmd( 'go', id ), cb )
  }
}


// control
app.control = {

  // pan/tilt
  decoder: function( cmd, cb ) {

    if( typeof cmd == 'string' && !cmd.match( /^[0-9]+$/ ) ) {
      switch( cmd ) {
        case 'stop'                    : cmd = "ptzStopRun"         ; break
        case 'up'                      : cmd = "ptzMoveUp"          ; break
        case 'down'                    : cmd = "ptzMoveDown"        ; break
        case 'left'                    : cmd = "ptzMoveLeft"        ; break
        case 'right'                   : cmd = "ptzMoveRight"       ; break
        case 'center'                  : cmd = "ptzReset"           ; break
        case 'top left'                : cmd = "ptzMoveTopLeft"     ; break
        case 'top right'               : cmd = "ptzMoveTopRight"    ; break
        case 'bottom left'             : cmd = "ptzMoveBottomLeft"  ; break
        case 'bottom right'            : cmd = "ptzMoveBottomRight" ; break
        case 'open infra led'          : cmd = "openInfraLed"       ; break
        case 'close infra led'         : cmd = "closeInfraLed"      ; break

        // not supported
        case 'vertical patrol'       : cmd = 26; break
        case 'stop vertical patrol'  : cmd = 27; break
        case 'horizontal patrol'     : cmd = 28; break
        case 'stop horizontal patrol': cmd = 29; break
        case 'io output high'        : cmd = 94; break
        case 'io output low'         : cmd = 95; break
      }
    }

    app.talk({
      path: 'cgi-bin/CGIProxy.fcgi',
      fields: { 
        cmd: cmd },
      callback: cb
    })
  },

  // camera settings
  camera: function( param, value, cb ) {

    // fix param
    if( typeof param == 'string' && !param.match( /^[0-9]+$/ ) ) {
      switch( param ) {

        case 'brightness': param = 1; break
        case 'contrast': param = 2; break

        // resolution
        case 'resolution':
          param = 0
          if( typeof value == 'string' && !value.match( /^[0-9]{1,2}$/ ) ) {
            switch( value ) {
              case '320':
              case '320x240':
              case '320*240':
                value = 8
                break

              case '640':
              case '640x480':
              case '640*480':
                value = 32
                break
            }
          }
          break

        case 'mode':
          param = 3
          if( typeof value == 'string' && !value.match( /^[0-9]$/ ) ) {
            switch( value.toLowerCase() ) {
              case '50':
              case '50hz':
              case '50 hz':
                value = 0
                break

              case '60':
              case '60hz':
              case '60 hz':
                value = 1
                break

              case 'outdoor':
              case 'outside':
                value = 2
                break
            }
          }
          break

        case 'flipmirror':
          param = 5
          if( typeof value == 'string' && !value.match( /^[0-9]$/ ) ) {
            switch( value.toLowerCase() ) {
              case 'default':
                value = 0
                break

              case 'flip':
                value = 1
                break

              case 'mirror':
                value = 2
                break

              case 'flipmirror':
              case 'flip&mirror':
              case 'flip+mirror':
              case 'flip + mirror':
              case 'flip & mirror':
                value = 3
                break
            }
          }
          break
      }
    }

    // send it
    app.talk({
      path: 'camera_control.cgi',
      fields: {
        param: param,
        value: value
      },
      callback: cb
    })

  }

}


// reboot
app.reboot = function( cb ) {
  app.talk({
    path: 'reboot.cgi',
    callback: cb
  })
}


// restore factory
app.restore_factory = function( cb ) {
  app.talk({
    path: 'restore_factory.cgi',
    callback: cb
  })
}


// params
app.params = function( cb ) {
  app.talk({
    path: 'get_params.cgi',
    callback: cb
  })
}


// set
app.set = {

  // alias
  alias: function( alias, cb ) {
    app.talk({
      path: 'set_alias.cgi',
      fields: { alias: alias },
      callback: cb
    })
  },

  // datetime
  datetime: function( props, cb ) {
    app.talk({
      path: 'set_datetime.cgi',
      fields: props,
      callback: cb
    })
  }

}


// snapshot
app.snapshot = function( filepath, cb ) {
  if( !cb && typeof filepath == 'function' ) {
    var cb = filepath
    var filepath = false
  }

  app.talk({
    path  : 'cgi-bin/CGIProxy.fcgi',
    fields: {
      cmd: 'snapPicture'
    },
    callback: function( err, html ) {
      if (err)
      {
        return cb(err);
      }
      var resText = JSON.stringify(html);
      if (!resText)
      {
        return cb(html); 
      }
      var match = resText.match(/\.\.\/([^\"]*)/);
      if (!match)
      {
        return cb(html);
      }
      var remotePath = match[1];
      app.talk({
        path: remotePath,
        encoding: 'binary',
        callback: function (err, bin){
          if( filepath ) {
          fs.writeFile( filepath, bin, 'binary', function( err ) {
            if( err ) {
              cb( err )
            } else {
              cb(null, filepath )
            }
          })
          } else {
            cb(null, bin )
          }
        }
      })
    }
  })
}


// communicate
app.talk = function( props ) {

  if( !props.fields ) {
    props.fields = {}
  }

  props.fields.usr = app.settings.user
  props.fields.pwd = app.settings.pass
  path = '/'+ props.path +'?'+ querystring.stringify( props.fields )

  // connect
  var req = http.request({
    host: app.settings.host,
    port: app.settings.port,
    path: path,
    method:   'GET'
  }, function( response ) {

    // response
    response.setEncoding( props.encoding || 'utf8' )
    var data = ''

    response.on( 'data', function( chunk ) { data += chunk })
    response.on( 'end', function() {

      if( typeof props.callback == 'function' ) {
        data = data.trim()
        if (data[0] == "<")
        {
          parseString(data, function (err, data){
            if (err)
            {
              callback(err);
            }
            else
            {
              props.callback(null, data);;
            }
          })
        }
        else
        {
          props.callback(null, data);
        }
      }
    })
  })

  // fail
  req.on( 'error', function( err ) {
    app.emit( 'connection-error', err )
  })

  // disconnect
  req.end()

}

// ready
module.exports = app