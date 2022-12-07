"""
This is where the implementation of the plugin code goes.
The PetriNetClassifier-class is imported from both run_plugin.py and run_debug.py
"""
import sys
import logging
from webgme_bindings import PluginBase

# Setup a logger
logger = logging.getLogger('PetriNetClassifier')
logger.setLevel(logging.INFO)
handler = logging.StreamHandler(sys.stdout)  # By default it logs to stderr..
handler.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)


class PetriNetClassifier(PluginBase):
    def main(self):
        core = self.core
        root_node = self.root_node
        active_node = self.active_node
        META = self.META
        nodes = core.load_sub_tree(active_node)

        places = {}
        transitions = {}

        nodesbypath = {}
        name2path = {}

        # save places and transitions first
        for node in nodes:
            nodesbypath[core.get_path(node)] = node
            name2path[core.get_attribute(node, 'name')] = core.get_path(node)
            if core.is_instance_of(node, META['Place']):
                places[core.get_path(node)] = { "inT": [], "outT": []}
            if core.is_instance_of(node, META['Transition']):
                transitions[core.get_path(node)] = {"inP": [], "outP": []}

        # save inT and outT for places and inP and outP for transitions
        for node in nodes:
            if core.is_instance_of(node, META['InplaceArc']):
                place = core.get_pointer_path(node,'src')
                transition = core.get_pointer_path(node, 'dst')
                places[place]['inT'].append(transition)
                transitions[transition]['inP'].append(place)
            if core.is_instance_of(node, META['OutplaceArc']):
                transition = core.get_pointer_path(node, 'src')
                place = core.get_pointer_path(node, 'dst')
                places[place]['outT'].append(transition)
                transitions[transition]['outP'].append(place)
        
        #debug for testin
        # for place in places:
        #     output = str(place) + ": " + str(places[place])
        #     self.send_notification("place: "+ output)
        # for transition in transitions:
        #     output = str(transition) + ": " + str(transitions[transition])
        #     self.send_notification("transition: "+output)
        

        # helper function to check free choice classification
        # if any transitions share an inplace then they must
        # have the exact same set of inplaces
        def free_choice():
            for t in transitions:
                for t2 in transitions:
                    if t != t2:
                        for p in transitions[t]["inP"]:
                            for p2 in transitions[t2]["inP"]:
                                if p == p2 and transitions[t]["inP"] != transitions[t2]["inP"]:
                                    return False
            return True

        # helper function to check state machine classification
        # each transition must have 1 inplace and 1 outplace
        def state_machine():
            for t in transitions:
                if len(transitions[t]["inP"]) != 1 or len(transitions[t]["outP"]) != 1:
                    return False
            return True

        # helper function to check marked graph classification
        # each place has 1 out transition and 1 in transition
        def marked_graph():
            for p in places:
                if len(places[p]['inT']) != 1 or len(places[p]['outT']) != 1:
                    return False
            return True
        
        # helper function to check workflow net classification
        # there should be a single start place and a single end place
        # all places and transitions should be in between those
        def workflow_net():
            startNode = ""
            endNode = ""
            # if there are two places without an arc from a transition going to the place
            # we know it is not since there are 2 starts ALSO
            # if there are two places with an arc going to a transition then
            # we know it is not since there are 2 ends
            for p in places:
                if len(places[p]['outT']) == 0:
                    # must be start
                    if startNode != "":
                        return False
                    startNode = p
                if len(places[p]['inT']) == 0:
                    # must be end
                    if endNode != "":
                        return False
                    endNode = p

            for t in transitions:
                if len(transitions[t]['inP']) == 0 or len(transitions[t]['outP']) == 0:
                    return False
            return True

        classifications = []
        if free_choice():
            classifications.append("free choice")
        if state_machine():
            classifications.append("state machine")
        if marked_graph():
            classifications.append("marked graph")
        if workflow_net():
            classifications.append("workflow net")
        
        if len(classifications) == 0:
            self.send_notification("The petri net cannot be classified as free choice, state machine, marked graph, or workflow net.")
        elif len(classifications) == 1:
            self.send_notification("The petri net can be classified as: " + classifications[0])
        else:
            output = "The petri net can be classified as: "
            for index,c in enumerate(classifications):
                if index != len(classifications) - 1:
                    output = output + c + ", "
                else:
                    output = output + "and " + c
            self.send_notification(output)

