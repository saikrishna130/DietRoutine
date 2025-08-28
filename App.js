import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, Button, Modal, ScrollView, Alert } from "react-native";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Patch: trap/log errors from scheduleNotificationAsync
 * Declared at file top so it's ALWAYS available to all code.
 */
function trapSafeScheduleNotificationAsync(opts) {
  return Notifications.scheduleNotificationAsync(opts).catch(err => {
    Alert.alert("Schedule Error", String(err));
    throw err;
  });
}


const reminders = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
];

const DISHES = {
  breakfast: [
    {
      name: "Oats Upma",
      recipe: "1. Cook oats briefly. 2. Sauté veggies, add oats, salt, pepper. 3. Toss, simmer for 2 min and serve."
    },
    {
      name: "Banana Smoothie",
      recipe: "1. Blend banana, milk/yogurt, honey. 2. Add seeds/nuts. 3. Serve cold."
    }
  ],
  lunch: [
    {
      name: "Vegetable Stir Fry",
      recipe: "1. Chop mixed veggies. 2. Sauté in oil with garlic. 3. Add soy sauce, toss 3-4 min, serve hot."
    },
    {
      name: "Dal Rice",
      recipe: "1. Cook rice and dal separately. 2. Season dal with cumin, garlic, tomatoes. 3. Serve dal over rice."
    }
  ],
  dinner: [
    {
      name: "Paneer Salad",
      recipe: "1. Cube paneer and veggies. 2. Mix with salt, lemon, olive oil & herbs. 3. Serve fresh."
    },
    {
      name: "Tomato Soup & Toast",
      recipe: "1. Boil tomatoes with onion, blend, strain. 2. Simmer with spices. 3. Serve hot with toast."
    }
  ]
};

function timeToMinutes(hh, mm) {
  return hh * 60 + mm;
}

function formatTime(hh, mm) {
  return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}

function getReminderTimes(startMins, endMins) {
  let times = [];
  let t = startMins;
  let interval = 30;
  while (t <= endMins) {
    times.push(t);
    t += interval;
    interval *= 2;
  }
  return times.filter((m) => m <= endMins);
}

async function requestNotifPermission() {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

async function scheduleReminders(reminderTimes, mealLabel) {
  // Make sure all triggers are in the future!
  const now = new Date();
  let count = 0, triggerDetails = [];
  for (let nextMinutes of reminderTimes) {
    // Compute target time as next future occurrence
    let nextTime = new Date(now);
    nextTime.setHours(Math.floor(nextMinutes / 60), nextMinutes % 60, 0, 0);

    // If the scheduled time is already in the past or now, move to next day
    if (nextTime <= now) nextTime.setDate(nextTime.getDate() + 1);

    // Only schedule if trigger is in the future
    const delaySeconds = Math.floor((nextTime - now) / 1000);
    if (delaySeconds > 0) {
      await trapSafeScheduleNotificationAsync({
        content: {
          title: `Reminder: ${mealLabel}`,
          body: `It's time for your ${mealLabel}!`,
          sound: true
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: nextTime
        }
      });
      count++;
      triggerDetails.push(nextTime.toString());
    }
  }
  if (count === 0) {
    Alert.alert("Reminders NOT scheduled", "No valid future reminders were found in this time range.");
  } else {
    Alert.alert("Reminders Set", `${count} notifications scheduled for ${mealLabel} at: \n\n${triggerDetails.join('\n')}`);
  }
  return count;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Ensure a notification channel is created for Android
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync('default', {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    sound: true,
    showBadge: true,
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIIVATE,
  });
}

const MEAL_COLORS = {
  breakfast: "#f4cc8dff", // matte pastel orange/peach
  lunch: "#bce4f5ff",     // matte mint/teal
  dinner: "#d9d9feff",    // matte lavender-blue
};

export default function App() {
  const [activeTab, setActiveTab] = useState("breakfast");
  const defaultTabTimes = {
    breakfast: { startHour: 8, startMin: 0, endHour: 10, endMin: 0 },
    lunch: { startHour: 12, startMin: 0, endHour: 14, endMin: 0 },
    dinner: { startHour: 19, startMin: 0, endHour: 21, endMin: 0 }
  };
  const [tabTimes, setTabTimes_] = useState(defaultTabTimes);

  // Persist tabTimes with AsyncStorage
  React.useEffect(() => {
    (async () => {
      try {
        const loaded = await AsyncStorage.getItem("tabTimes");
        if (loaded) setTabTimes_(JSON.parse(loaded));
      } catch {}
    })();
  }, []);
  React.useEffect(() => {
    AsyncStorage.setItem("tabTimes", JSON.stringify(tabTimes));
  }, [JSON.stringify(tabTimes)]);
  const setTabTimes = (fn) => {
    setTabTimes_(prev => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      AsyncStorage.setItem("tabTimes", JSON.stringify(next));
      return next;
    });
  };
  const [modalVisible, setModalVisible] = useState(false);
  const [modalStep, setModalStep] = useState("main");
  const [isSetting, setIsSetting] = useState(false);
  const [isWaterSetting, setIsWaterSetting] = useState(false);

  // Repeat state for each meal
  const [repeatMeals, setRepeatMeals_] = useState({
    breakfast: false,
    lunch: false,
    dinner: false,
  });

  // Persist repeatMeals using AsyncStorage
  React.useEffect(() => {
    (async () => {
      try {
        const loaded = await AsyncStorage.getItem("repeatMeals");
        if (loaded) setRepeatMeals_(JSON.parse(loaded));
      } catch {}
    })();
  }, []);
  React.useEffect(() => {
    AsyncStorage.setItem("repeatMeals", JSON.stringify(repeatMeals));
  }, [JSON.stringify(repeatMeals)]);
  const setRepeatMeals = (fn) => {
    setRepeatMeals_(prev => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      AsyncStorage.setItem("repeatMeals", JSON.stringify(next));
      return next;
    });
  };

  // App memory: queue of all scheduled notification info
  const [scheduledNotifs, setScheduledNotifs] = useState([]);

  // NEW: unified scheduled notifications raw array for debug/listing
  const [allScheduledRaw, setAllScheduledRaw] = useState([]);

  // Time picker state for start/end
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerField, setPickerField] = useState(""); // "start" or "end"

  const times = tabTimes[activeTab];
  const startMins = timeToMinutes(times.startHour, times.startMin);
  const endMins = timeToMinutes(times.endHour, times.endMin);
  const remindersInRange = getReminderTimes(startMins, endMins);

    // Fetch and update upcoming reminders (for each meal, all) into state
  async function refreshScheduledReminders() {
    try {
      const all = await Notifications.getAllScheduledNotificationsAsync();
      setAllScheduledRaw(all);
    } catch (e) {
      setAllScheduledRaw([]);
    }
  }

  // Helper: next scheduled reminder(s) for display
  function NextScheduledReminders({ activeTab }) {
    const [mealReminders, setMealReminders] = React.useState([]);
    const mealLabel = reminders.find(r => r.key === activeTab).label;

    async function fetchReminders() {
      try {
        
        const all = await Notifications.getAllScheduledNotificationsAsync();
        const now = new Date();
        const mealLabelLower = mealLabel.toLowerCase();

        // Show scheduled meal and hydration reminders (even if after meal end)
        const allWithDate = all
          .map(n => {
            let triggerDate = null;
            if (n.trigger?.type == "date") {
              triggerDate = new Date(n.trigger.value);
            } else if (n.trigger?.value !== undefined) {
              triggerDate = new Date(now.getTime() + n.trigger.value * 1000);
            }
            return { ...n, _triggerDate: triggerDate };
          })
          .filter(n => {
            if (!n._triggerDate) return false;
            // Meal reminders for this tab (regardless of time) OR hydration reminders for this tab (in future)
            const hasMeal = n.content?.title?.toLowerCase().includes(mealLabelLower);
            const isWater = n.content?.title?.toLowerCase().includes("hydration") || n.content?.body?.toLowerCase().includes("hydration");
            return (hasMeal && n._triggerDate > now) || (isWater && n._triggerDate > now);
          })
          .sort((a, b) => a._triggerDate - b._triggerDate);
        setMealReminders(allWithDate);
      } catch {
        setMealReminders([]);
      }
    }

    React.useEffect(() => {
      fetchReminders();
      // eslint-disable-next-line
    }, [activeTab]);

    if (!mealReminders.length) {
      return (
        <Text style={[styles.minimalNote, { textAlign: "center", width: "100%" }]}>
          No reminders scheduled for {mealLabel}.
        </Text>
      );
    }

    return (
      <View style={{
        flexDirection: "column",
        alignItems: "stretch",
        width: "100%",
        gap: 2,
      }}>
        {mealReminders.slice(0, 5).map((notif, idx) => (
          <View
            key={notif.identifier || idx}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: "100%",
              marginBottom: 6,
              backgroundColor: "#fff7",
              borderRadius: 8,
              paddingVertical: 6,
              paddingHorizontal: 8,
              flexWrap: "wrap"
            }}>
            <Text style={[styles.reminderTime, {flex: 1, flexWrap: "wrap"}]}>
              {notif._triggerDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })},{" "}
              {notif._triggerDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}{" "}
              - {notif.content?.body}
            </Text>
            <TouchableOpacity
              accessibilityLabel={`Delete notification for ${notif._triggerDate}`}
              onPress={async () => {
                try {
                  await Notifications.cancelScheduledNotificationAsync(notif.identifier);
                  await new Promise(res => setTimeout(res, 150));
                  fetchReminders();
                } catch (e) {
                  Alert.alert("Error", "Failed to cancel reminder: " + e.message);
                }
              }}>
              <Text style={{ fontSize: 18, color: '#d33', marginLeft: 8 }}>❌</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    );
  }

  // Show permissions state at startup
  React.useEffect(() => {
    // Show battery optimization notice on first app open
    (async () => {
      try {
        const flag = await AsyncStorage.getItem("batteryOptimizationPrompted");
        if (!flag) {
          Alert.alert(
            "Enable Reminders",
            "To ensure DietRoutine can remind you reliably, please disable battery optimization for this app in your phone's settings.",
            [{ text: "OK, Got It", onPress: async () => {
              await AsyncStorage.setItem("batteryOptimizationPrompted", "yes");
            }}]
          );
        }
      } catch {}
    })();

    refreshScheduledReminders();
    // Add listener to reload reminders when coming back to app
    const sub = Notifications.addNotificationReceivedListener(refreshScheduledReminders);
    return () => {
      if (sub) sub.remove?.();
    };
    // eslint-disable-next-line
  }, []);

  React.useEffect(() => {
    // Also refresh when changing tab
    refreshScheduledReminders();
    // eslint-disable-next-line
  }, [activeTab]);

  React.useEffect(() => {
    // Open reminder modal when notification is tapped (while app running)
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      try {
        const notif = response.notification;
        // Try to extract meal type (find which tab/label)
        let mealKey = "breakfast";
        let found = false;
        if (notif && notif.request && notif.request.content && notif.request.content.title) {
          const title = notif.request.content.title.toLowerCase();
          for (const tab of reminders) {
            if (title.includes(tab.label.toLowerCase())) {
              mealKey = tab.key;
              found = true;
              break;
            }
          }
        }
        setActiveTab(mealKey);
        setModalStep("main"); // Always show standard reminder modal
        setModalVisible(true);
      } catch (e) {
        console.log("Error in notification tap handler", e);
      }
    });

    // On app launch, check if launched from a notification tap
    (async () => {
      try {
        const lastResponse = await Notifications.getLastNotificationResponseAsync();
        if (lastResponse && lastResponse.notification) {
          const notif = lastResponse.notification;
          let mealKey = "breakfast";
          let found = false;
          if (notif && notif.request && notif.request.content && notif.request.content.title) {
            const title = notif.request.content.title.toLowerCase();
            for (const tab of reminders) {
              if (title.includes(tab.label.toLowerCase())) {
                mealKey = tab.key;
                found = true;
                break;
              }
            }
          }
          setActiveTab(mealKey);
          setModalStep("main");
          setModalVisible(true);
        }
      } catch (e) {
        // fail silent
      }
    })();

    return () => sub && sub.remove();
  }, []);

  // OLD pickers replaced with modal
  const showTimePicker = (field) => {
    setPickerField(field);
    setPickerVisible(true);
  };
  const hideTimePicker = () => setPickerVisible(false);

  const handleTimePicked = (date) => {
    hideTimePicker();
    const hh = date.getHours();
    const mm = date.getMinutes();
    if (pickerField === "start") {
      setTabTimes(prev => ({
        ...prev,
        [activeTab]: {
          ...prev[activeTab],
          startHour: hh,
          startMin: mm
        }
      }));
    } else if (pickerField === "end") {
      setTabTimes(prev => ({
        ...prev,
        [activeTab]: {
          ...prev[activeTab],
          endHour: hh,
          endMin: mm
        }
      }));
    }
  };

  const onNoHadMeal = () => setModalStep("suggestionOffer");
  const onRequestSuggestions = () => setModalStep("showDishes");
  const onDismissModal = () => {
    setModalVisible(false);
    setTimeout(() => setModalStep("main"), 400);
  };

  // Track if water modal was triggered from Had Meal button
  const [waterFromButton, setWaterFromButton] = useState(false);
  // Track interval (minutes) selected for hydration reminders
  const [waterInterval, setWaterInterval] = useState(120); // default 2 hours

  // Modal: after user clicked Yes for having meal
  const onYesHadMeal = () => {
    setWaterFromButton(false);
    setModalStep("waterOffer");
  };

  // Water reminder (hydration) logic; intervalMinutes: interval in minutes (default 120)
  async function scheduleWaterReminders(currTab, intervalMinutes = null) {
    setIsWaterSetting(true);
    try {
      // Remove meal reminders for today (unchanged)
      try {
        const mealLabel = reminders.find(r => r.key === currTab).label.toLowerCase();
        const now = new Date();
        const oldNotifs = await Notifications.getAllScheduledNotificationsAsync();
        for (const n of oldNotifs) {
          let t = n.content?.title?.toLowerCase?.() || "";
          let triggerDate = null;
          if (n.trigger?.type === "date") {
            triggerDate = new Date(n.trigger.value);
          } else if (n.trigger?.value !== undefined) {
            triggerDate = new Date(now.getTime() + n.trigger.value * 1000);
          }
          // Only remove future meal reminders for THIS meal type ON TODAY
          if (
            t.includes(mealLabel) &&
            triggerDate &&
            triggerDate > now &&
            triggerDate.getFullYear() === now.getFullYear() &&
            triggerDate.getMonth() === now.getMonth() &&
            triggerDate.getDate() === now.getDate()
          ) {
            await Notifications.cancelScheduledNotificationAsync(n.identifier);
          }
        }
      } catch (e) {}

      // Schedule two hydration reminders at user-selected interval (default to 2h)
      let interval = intervalMinutes ?? waterInterval ?? 120; // fallback to state/default
      let now = new Date();
      let timesDebug = [];
      let count = 0;
      for (let x = 1; x <= 2; ++x) {
        let dt = new Date(now.getTime() + x * interval * 60 * 1000);
        await trapSafeScheduleNotificationAsync({
          content: {
            title: "Hydration Reminder",
            body: "This is your periodic water reminder. Stay hydrated!",
            sound: true
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: dt
          }
        });
        timesDebug.push(dt.toString());
        count++;
      }

      Alert.alert("Water Reminders Set", `${count} reminders set for hydration at:\n\n${timesDebug.join('\n')}`);
      await refreshScheduledReminders();
    } catch (e) {
      Alert.alert("Error", "Failed to set water reminders: " + e.message);
    }
    setIsWaterSetting(false);
    onDismissModal();
  }

  const handleSetAlarms = async () => {
    setIsSetting(true);
    try {
      // Remove only previous reminders for this meal type (not all)
      try {
        const mealLabel = reminders.find(r => r.key === activeTab).label.toLowerCase();
        const oldNotifs = await Notifications.getAllScheduledNotificationsAsync();
        for (const n of oldNotifs) {
          let t = n.content?.title?.toLowerCase?.() || "";
          if (t.includes(mealLabel)) {
            await Notifications.cancelScheduledNotificationAsync(n.identifier);
          }
        }
      } catch (e) {
        // Fail silently
      }

      const granted = await requestNotifPermission();
      if (!granted) {
        Alert.alert("Permission required", "Notifications permission is required to set reminders.");
        setIsSetting(false);
        return;
      }
      let count = 0;
      const mealKey = activeTab;
      if (repeatMeals[mealKey]) {
        // Schedule for the next 14 days
        const label = reminders.find(r => r.key === mealKey).label;
        for (let dayOffset = 0; dayOffset < 14; ++dayOffset) {
          const dayBase = new Date();
          dayBase.setDate(dayBase.getDate() + dayOffset);
          for (let timeMin of remindersInRange) {
            let dt = new Date(dayBase.getFullYear(), dayBase.getMonth(), dayBase.getDate(),
                              Math.floor(timeMin/60), timeMin%60, 0, 0);
            if (dt > new Date()) {
              await trapSafeScheduleNotificationAsync({
                content: {
                  title: `Reminder: ${label}`,
                  body: `Reminder for ${label}!`,
                  sound: true
                },
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.DATE,
                  date: dt
                }
              });
              count++;
            }
          }
        }
      } else {
        count = await scheduleReminders(remindersInRange, reminders.find(r => r.key === activeTab).label);
      }
      await refreshScheduledReminders();
    } catch (e) {
      Alert.alert("Error", "Failed to set reminders: " + e.message);
    }
    setIsSetting(false);
  };
  // DEBUG: Show scheduled notifications JSON in alert
  async function showAllScheduledDebug() {
    try {
      const all = await Notifications.getAllScheduledNotificationsAsync();
      Alert.alert("Raw Scheduled Notifications", JSON.stringify(all, null, 2).slice(0, 4000));
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }

  // Debug: check notifications permission
  async function checkPermissionsDebug() {
    try {
      const perm = await Notifications.getPermissionsAsync();
      Alert.alert(
        "Notification Permissions",
        JSON.stringify(perm, null, 2)
      );
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }

  /**
 * Patch: trap/log errors from scheduleNotificationAsync
 * Declared outside React component so available everywhere.
 */
function trapSafeScheduleNotificationAsync(opts) {
  return Notifications.scheduleNotificationAsync(opts).catch(err => {
    Alert.alert("Schedule Error", String(err));
    throw err;
  });
}


  // Overwrite in-place: swap all usages in scheduleReminders and scheduleWaterReminders
  // (Careful to only swap at the call sites below—not generic search/replace.)

  return (
    <View style={[
      styles.container,
      { backgroundColor: MEAL_COLORS[activeTab] }
    ]}>
      <StatusBar translucent style="dark" />
      <View style={{
        width: "100%",
        height: Platform.OS === "android" && StatusBar.currentHeight ? StatusBar.currentHeight : 32,
        backgroundColor: MEAL_COLORS[activeTab],
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 0,
      }} />
      <Text style={styles.title}>DietRoutine</Text>
      <View style={styles.tabBar}>
        {reminders.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key && styles.tabActive,
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[
              styles.tabLabel,
              activeTab === tab.key && styles.tabLabelActive
            ]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView style={{ width: "100%" }} contentContainerStyle={{ alignItems: "center" }}>
        <View style={styles.reminderCard}>
          <Text style={styles.reminderTitle}>{reminders.find(r => r.key === activeTab).label} Reminder</Text>
          <Text style={styles.minimalNote}>Set your preferred start and end time:</Text>
          <View style={styles.timeRow}>
            {/* Start time modal selector */}
            <View style={styles.timeGroup}>
              <Text style={styles.timeLabel}>Start</Text>
              <TouchableOpacity
                style={styles.timeSelectorBtn}
                onPress={() => showTimePicker("start")}
              >
                <Text style={styles.timeSelected}>
                  {formatTime(times.startHour, times.startMin)}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={{ width: 16 }} />
            {/* End time modal selector */}
            <View style={styles.timeGroup}>
              <Text style={styles.timeLabel}>End</Text>
              <TouchableOpacity
                style={styles.timeSelectorBtn}
                onPress={() => showTimePicker("end")}
              >
                <Text style={styles.timeSelected}>
                  {formatTime(times.endHour, times.endMin)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          {/* Repeat and Set row */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: "center", marginTop: 10, marginBottom: 20, gap: 16 }}>
            <TouchableOpacity
              onPress={() => setRepeatMeals(prev => ({ ...prev, [activeTab]: !prev[activeTab] }))}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'center'
              }}
            >
              <View style={{
                width: 24, height: 24, borderRadius: 5, borderWidth: 2,
                borderColor: "#555", backgroundColor: repeatMeals[activeTab] ? "#292929" : "#fff",
                justifyContent: "center", alignItems: "center"
              }}>
                {repeatMeals[activeTab] && <Text style={{ color: "#fff", fontSize: 16 }}>✓</Text>}
              </View>
              <Text style={{
                marginLeft: 10, fontSize: 17,
                fontWeight: "600", color: "#292929"
              }}>
                Repeat
              </Text>
            </TouchableOpacity>
            <Button title={isSetting ? "Setting..." : "Set"} onPress={handleSetAlarms} disabled={isSetting} />
          </View>
          {/* Manual Had Meal button row, below */}
          <View style={{ alignItems: "center", marginBottom: 12 }}>
            <Button
              title={isWaterSetting ? "Setting..." : "Had Meal (Hydration)"}
              onPress={() => {
                setWaterFromButton(true);
                setModalStep("waterOffer");
                setModalVisible(true);
              }}
              disabled={isWaterSetting}
            />
          </View>
          {/* Modal time picker */}
          <DateTimePickerModal
            isVisible={pickerVisible}
            mode="time"
            date={pickerField === "end"
              ? new Date(2000, 0, 1, times.endHour, times.endMin)
              : new Date(2000, 0, 1, times.startHour, times.startMin)
            }
            minuteInterval={1}
            onConfirm={handleTimePicked}
            onCancel={hideTimePicker}
            is24Hour={true}
            display={Platform.OS === "ios" ? "spinner" : "default"}
          />
          <View style={[styles.reminderTimesBox, { marginBottom: 8 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", width: '100%' }}>
              <Text style={styles.reminderListLabel}>Reminders in Range:</Text>
              <TouchableOpacity
                onPress={() => Alert.alert('Reminders in Range', 'These are the possible reminders for the selected time window.')}
                style={{ marginLeft: 8, padding: 2 }}
                accessibilityLabel="Information about reminders in range"
              >
                <Text style={{ fontSize: 18, color: "#1976d2", borderRadius: 12, borderColor: "#1976d2" }}>ⓘ</Text>
              </TouchableOpacity>
            </View>
            {remindersInRange.length === 0 ? (
              <Text style={styles.minimalNote}>No reminders in this range.</Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", width: "100%", justifyContent: "center", alignItems: "center", marginTop: 4 }}>
                {remindersInRange.map((mins, idx) => (
                  <Text style={styles.reminderTime} key={idx}>
                    {formatTime(Math.floor(mins / 60), mins % 60)}
                    {idx !== remindersInRange.length - 1 && <Text style={{ color: "#aaa" }}> | </Text>}
                  </Text>
                ))}
              </View>
            )}
          </View>
          {/* Next scheduled reminders (for this meal only) */}
          <View style={[styles.reminderTimesBox, { marginTop: 6, marginBottom: 32 }]}>
            <Text style={styles.reminderListLabel}>Next Scheduled:</Text>
            <View style={{maxHeight: 220, width: "100%"}}>
              <ScrollView style={{width: "100%"}} contentContainerStyle={{paddingBottom: 6}}>
                <NextScheduledReminders activeTab={activeTab} />
              </ScrollView>
            </View>
            <View style={{ marginTop: 12 }}>
              <Button
                title="Clear All Reminders"
                onPress={() => {
                  Alert.alert(
                    `Clear All ${reminders.find(r => r.key === activeTab).label} Reminders`,
                    `Are you sure you want to delete all ${reminders.find(r => r.key === activeTab).label} reminders?`,
                    [
                      { text: "No", style: "cancel" },
                      {
                        text: "Yes",
                        style: "destructive",
                        onPress: async () => {
                          try {
                            const all = await Notifications.getAllScheduledNotificationsAsync();
                            const mealLabel = reminders.find(r => r.key === activeTab).label.toLowerCase();
                            let deleted = 0;
                            for (const n of all) {
                              const title = n.content?.title?.toLowerCase() || "";
                              const body = n.content?.body?.toLowerCase() || "";
                              // Match ONLY meal reminders for this meal type; do NOT match "hydration" reminders
                              if (
                                (title.includes(mealLabel) || body.includes(mealLabel)) &&
                                !title.includes("hydration") &&
                                !body.includes("hydration")
                              ) {
                                await Notifications.cancelScheduledNotificationAsync(n.identifier);
                                deleted++;
                              }
                            }
                            await refreshScheduledReminders();
                            Alert.alert(`${reminders.find(r => r.key === activeTab).label} reminders cleared`, `${deleted} reminder(s) removed.`);
                          } catch (e) {
                            Alert.alert("Error", "Failed to clear scheduled reminders: " + e.message);
                          }
                        }
                      }
                    ]
                  );
                }}
              />
            </View>
          </View>
        </View>
      </ScrollView>
      {/* Simulated Reminder Prompt Modal */}
      <Modal
        animationType="slide"
        transparent
        visible={modalVisible}
        onRequestClose={onDismissModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {modalStep === "main" && (
              <>
                <Text style={styles.reminderPrompt}>
                  This is your {reminders.find(r => r.key === activeTab).label} reminder.
                </Text>
                <Text>Did you have {reminders.find(r => r.key === activeTab).label}?</Text>
                <View style={{ flexDirection: 'row', marginTop: 10 }}>
                  <Button title="Yes" onPress={onYesHadMeal} />
                  <View style={{ width: 16 }} />
                  <Button title="No" onPress={onNoHadMeal} />
                </View>
              </>
            )}
            {modalStep === "waterOffer" && (
              <>
                <Text style={styles.reminderPrompt}>
                  Choose how often you'd like to be reminded to drink water:
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: "center", gap: 8, marginBottom: 8 }}>
                  <Button
                    title="30 min"
                    onPress={() => {
                      setModalVisible(false);
                      setWaterInterval(30);
                      setTimeout(() => {
                        scheduleWaterReminders(activeTab, 30);
                        setWaterFromButton(false);
                      }, 150);
                    }}
                    disabled={isWaterSetting}
                  />
                  <Button
                    title="1 hr"
                    onPress={() => {
                      setModalVisible(false);
                      setWaterInterval(60);
                      setTimeout(() => {
                        scheduleWaterReminders(activeTab, 60);
                        setWaterFromButton(false);
                      }, 150);
                    }}
                    disabled={isWaterSetting}
                  />
                  <Button
                    title="2 hr"
                    onPress={() => {
                      setModalVisible(false);
                      setWaterInterval(120);
                      setTimeout(() => {
                        scheduleWaterReminders(activeTab, 120);
                        setWaterFromButton(false);
                      }, 150);
                    }}
                    disabled={isWaterSetting}
                  />
                </View>
                <Button title="Cancel" onPress={() => {
                  setModalVisible(false);
                  setWaterFromButton(false);
                }} />
              </>
            )}
            {modalStep === "suggestionOffer" && (
              <>
                <Text style={styles.reminderPrompt}>
                  Would you like suggestions for {reminders.find(r => r.key === activeTab).label} dishes?
                </Text>
                <View style={{ flexDirection: 'row', marginTop: 10 }}>
                  <Button title="Yes" onPress={onRequestSuggestions} />
                  <View style={{ width: 16 }} />
                  <Button title="No" onPress={onDismissModal} />
                </View>
              </>
            )}
            {modalStep === "showDishes" && (
              <ScrollView>
                <Text style={styles.reminderPrompt}>Dishes & Recipes:</Text>
                {DISHES[activeTab].map((dish, idx) => (
                  <View key={idx} style={{ marginBottom: 18 }}>
                    <Text style={{ fontWeight: "700", fontSize: 16 }}>{dish.name}</Text>
                    <Text style={{ color: "#444", fontSize: 14, marginTop: 2 }}>{dish.recipe}</Text>
                  </View>
                ))}
                <Button title="Close" onPress={onDismissModal} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "flex-start",
    // Add +2cm (roughly 75.6px) to avoid camera cutout; fallback to current value if Platform is unknown
    paddingTop: Platform.OS === "android" ? 32 + 76 : 52 + 76,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 18,
  },
  tabBar: {
    flexDirection: "row",
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: "#f2f2f2",
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 16,
  },
  tabActive: {
    backgroundColor: "#292929",
  },
  tabLabel: {
    color: "#292929",
    fontWeight: "500",
    fontSize: 18,
  },
  tabLabelActive: {
    color: "#fff",
    fontWeight: "700",
  },
  reminderCard: {
    width: "95%",
    minHeight: 160,
    marginTop: 20,
    backgroundColor: "#fafbfc",
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0003",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 3,
    padding: 12
  },
  reminderTitle: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 8,
  },
  minimalNote: {
    color: "#999",
    fontSize: 14,
    marginBottom: 8,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    marginBottom: 8,
    marginTop: 4,
    flexWrap: "wrap",
    maxWidth: "100%",
    width: "100%",
  },
  timeGroup: {
    alignItems: "center",
    marginBottom: 4,
    minWidth: 110,
    flex: 1
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%"
  },
  timeSelected: {
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 2,
    color: "#373737",
    paddingBottom: 2,
    letterSpacing: 0.3
  },
  timeSelectorBtn: {
    backgroundColor: "#f2f2f2",
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 18,
    marginTop: 3,
    minWidth: 70,
    alignItems: "center"
  },
  timeLabel: {
    fontWeight: "500",
    fontSize: 16,
    marginHorizontal: 2
  },
  timeColon: {
    fontWeight: "600",
    fontSize: 18,
    marginHorizontal: 2
  },
  selectedTimeInline: {
    fontSize: 15,
    color: "#555",
    fontWeight: "700"
  },
  reminderTimesBox: {
    width: "90%",
    marginTop: 18,
    backgroundColor: "#eef1f4",
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 10,
    marginBottom: 32
  },
  reminderListLabel: {
    fontWeight: "600",
    fontSize: 15,
    marginBottom: 5,
    letterSpacing: 0.2
  },
  reminderTime: {
    fontSize: 16,
    marginBottom: 2,
    color: "#333",
    fontWeight: "400"
  },
  infoBox: {
    backgroundColor: "#d1e0fa",
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
    marginBottom: 24,
    width: "90%"
  },
  infoNote: {
    color: "#254178",
    fontSize: 14,
    lineHeight: 18
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0007",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 30,
    width: 300,
    maxHeight: "80%",
    alignItems: "center",
    elevation: 8,
  },
  reminderPrompt: {
    fontSize: 18,
    fontWeight: "500",
    marginBottom: 20,
    textAlign: "center"
  }
});
